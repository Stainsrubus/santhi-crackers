import { sendNotification } from "@/lib/firebase";
// import { razor } from "@/lib/razorpay";
import { generateRandomString } from "@/lib/util";
import { broadcastMessage } from "@/lib/ws-store";
import { CouponModel } from "@/models/coupon-model";
import { StoreModel } from "@/models/store-model";
import { User } from "@/models/user-model";
import { Address } from "@/models/user/address-model";
import { CartModel } from "@/models/user/cart-model";
import { OrderModel } from "@/models/user/order-model";
import { StoreType } from "@/types";
import axios from "axios";
import Elysia, { t } from "elysia";
import mongoose from "mongoose";
import { Product } from "@/models/product";
import  ComboOffer  from "@/models/combo-model";
import { razor } from "@/lib/razorpay";
import { NotificationModel } from "@/models/notification-model";

export const userOrderController = new Elysia({
  prefix: "/orders",
  detail: {
    tags: ["User - Orders"],
    security: [
      {
        bearerAuth: [],
      },
    ],
  },
})
.post(
  "/order",
  async ({ set, store, body }) => {
    const userId = (store as StoreType)["id"];
    const { addressId, couponId, razorPayResponse } = body;

    try {
      // Parse Razorpay response
      let razorPayRes;
      try {
        razorPayRes = razorPayResponse ? JSON.parse(razorPayResponse) : {};
      } catch (error) {
        set.status = 400;
        return { message: "Invalid Razorpay response format", status: false };
      }

      const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = razorPayRes;

      // Verify payment signature
      if (razorpay_payment_id && razorpay_order_id && razorpay_signature) {
        const crypto = require("crypto");
        const generatedSignature = crypto
          .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
          .update(`${razorpay_order_id}|${razorpay_payment_id}`)
          .digest("hex");

        if (generatedSignature !== razorpay_signature) {
          set.status = 400;
          return { message: "Invalid payment signature", status: false };
        }
      } else if (razorPayResponse) {
        set.status = 400;
        return { message: "Incomplete Razorpay response", status: false };
      }

      const cart = await CartModel.findOne({
        user: new mongoose.Types.ObjectId(userId),
        status: "active",
      }).populate("products.productId");

      const user = await User.findById(userId);

      if (!cart) {
        set.status = 404;
        return { message: "No active cart found", status: false };
      }

      if (!user) {
        set.status = 404;
        return { message: "User not found", status: false };
      }

      const address = await Address.findById(addressId);

      if (!address) {
        set.status = 404;
        return { message: "Address not found", status: false };
      }

      // Step 1: Validate stock for all products in cart
      const stockValidationErrors = [];
      const validProducts = [];

      for (const cartItem of cart.products) {
        const product = await Product.findById(cartItem.productId);
        if (!product) {
          stockValidationErrors.push({
            productId: cartItem.productId,
            message: "Product not found",
          });
          continue;
        }

        if (product.stock < cartItem.quantity) {
          stockValidationErrors.push({
            productId: cartItem.productId,
            productName: product.productName,
            requestedQuantity: cartItem.quantity,
            availableStock: product.stock,
            message: `Insufficient stock for ${product.productName}. Available: ${product.stock}, Requested: ${cartItem.quantity}`,
          });
        } else {
          validProducts.push({
            cartItem,
            product,
          });
        }
      }

      if (stockValidationErrors.length > 0) {
        set.status = 400;
        return {
          message: "Some products have insufficient stock",
          status: false,
          errors: stockValidationErrors,
          validProducts: validProducts.map((item) => ({
            productId: item.cartItem.productId,
            productName: item.product.productName,
            availableStock: item.product.stock,
          })),
        };
      }

      let Estore = await StoreModel.findOne({});
      let orderId = generateRandomString(6, "JME");

      const orderProducts = cart.products.map((product) => ({
        productId: product.productId,
        quantity: product.quantity,
        totalAmount: product.totalAmount,
        price: product.price,
        options: product.options,
        selectedOffer: product.selectedOffer,
      }));

      // Log all relevant data before order creation
      console.log("=== Order Creation Data ===");
      console.log("User ID:", userId);
      console.log("Cart Details:", {
        cartId: cart._id,
        products: cart.products.map(p => ({
          productId: p.productId,
          price: p.price,
          quantity: p.quantity,
          totalAmount: p.totalAmount,
          selectedOffer: p.selectedOffer,
        })),
        subtotal: cart.subtotal,
        tax: cart.tax,
        totalPrice: cart.totalPrice,
        deliveryFee: cart.deliveryFee,
        platformFee: cart.platformFee,
        totalDistance: cart.totalDistance,
        deliverySeconds: cart.deliverySeconds,
      });
      console.log("Address ID:", addressId);
      console.log("Coupon ID:", couponId || "None");
      console.log("Razorpay Response:", razorPayRes);
      console.log("Order Products:", orderProducts);
      console.log("Calculated Values Before Coupon:", {
        subtotal: cart.subtotal,
        tax: cart.tax,
        totalPrice: cart.totalPrice,
      });

      const order = new OrderModel({
        user: cart.user,
        store: Estore?._id,
        products: orderProducts,
        addressId: address._id,
        deliverySeconds: cart.deliverySeconds,
        distance: cart.totalDistance,
        platformFee: cart.platformFee || 0,
        deliveryPrice: cart.deliveryFee || 0,
        subtotal: cart.subtotal,
        tax: cart.tax,
        totalPrice: cart.totalPrice,
        status: "pending",
        paymentMethod: razorPayResponse ? "Online" : "Cash on Delivery",
        paymentStatus: razorPayResponse ? "completed" : "pending",
        orderId,
        razorPayResponse: razorPayResponse || "",
        razorPayId: razorpay_payment_id || "",
        razorOrderId: razorpay_order_id || "",
      });

      // Apply coupon if provided
      if (couponId) {
        const coupon = await CouponModel.findById(couponId);
        if (coupon) {
          const discountAmount = (coupon.discount / 100) * cart.totalPrice;
          order.couponDiscount = discountAmount;
          order.coupon = coupon._id;
          order.couponCode = coupon.code;
          order.totalPrice = cart.totalPrice - discountAmount;
          console.log("Coupon Applied:", {
            couponId: coupon._id,
            discount: coupon.discount,
            discountAmount,
            newTotalPrice: order.totalPrice,
          });
        }
      }

      // Log final order data
      console.log("Final Order Data:", {
        orderId: order.orderId,
        subtotal: order.subtotal,
        tax: order.tax,
        totalPrice: order.totalPrice,
        couponDiscount: order.couponDiscount || 0,
        paymentMethod: order.paymentMethod,
        paymentStatus: order.paymentStatus,
      });

      // Get map directions if not already available
      if (!address.mapPloygonResponse) {
        const response = await axios.get(
          `https://maps.googleapis.com/maps/api/directions/json?origin=${Estore?.latitude},${Estore?.longitude}&destination=${address.latitude},${address.longitude}&key=${process.env.GOOGLE_MAPS_API_KEY}`
        );
        address.mapPloygonResponse = JSON.stringify(response.data);
        order.mapPloygonResponse = JSON.stringify(response.data);
        await address.save();
      }

      // Step 2: Reduce stock for all valid products
      for (const { cartItem, product } of validProducts) {
        product.stock -= cartItem.quantity;
        await product.save();
      }

      // Save the order
      await order.save();
      console.log("Order Saved:", order.toObject());

      // Remove negotiation attempts for products in the cart
      const productIds = cart.products.map((product) => product.productId._id.toString());
      user.attempts = user.attempts.filter((attempt) => !productIds.includes(attempt.productId));

      // Clear the cart
      cart.products = [];
      cart.subtotal = 0;
      cart.tax = 0;
      cart.totalPrice = 0;
      cart.deliveryFee = 0;
      cart.deliverySeconds = 0;
      cart.platformFee = 0;
      cart.totalDistance = 0;
      await cart.save();

      // Save the updated user with attempts removed
      await user.save();

      // Broadcast and notify
      broadcastMessage(
        `New Order with Order ID: ${orderId} is placed by ${user.username}`
      );
      const notificationTitle = "Order Placed!";
      const notificationContent = `Your order #${orderId} has been placed successfully.`;
      await sendNotification(
        user.fcmToken,
        notificationTitle,
        notificationContent
      );

      // Save notification to Notifications collection
      const notification = new NotificationModel({
        userId: new mongoose.Types.ObjectId(userId),
        title: notificationTitle,
        description: notificationContent,
        type: "order",
        orderId: order._id
      });
      await notification.save();

      return {
        message: "Order created successfully",
        status: true,
        order,
        paymentRequired: !!razorPayResponse,
      };
    } catch (error) {
      set.status = 500;
      console.error("Order Creation Error:", error);
      return {
        message: "Failed to create order",
        status: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
  {
    body: t.Object({
      addressId: t.String({
        pattern: `^[a-fA-F0-9]{24}$`,
      }),
      couponId: t.Optional(t.String()),
      razorPayResponse: t.Optional(t.String()),
    }),
    detail: {
      summary: "Create order (with or without payment)",
      description: "Create a new order from the user's cart with stock validation, supports both COD and online payment",
    },
  }
)
.post(
  "/createpayorder",
  async ({ set, store }) => {
    try {
      const userId = (store as StoreType)["id"];

      const cart = await CartModel.findOne({
        user: new mongoose.Types.ObjectId(userId),
        status: "active"
      }).populate("products.productId")
      .lean();

      if (!cart) {
        set.status = 404;
        return { message: "No active cart found", status: false };
      }
      if (typeof cart.totalPrice !== "number" || cart.totalPrice <= 0) {
        set.status = 400;
        return { message: "Invalid cart total amount", status: false };
      }

      const response: any = await razor.orders.create({
        amount: cart.totalPrice*100,
        currency: "INR",
      });

      if (!response || response.error) {
        set.status = 500;
        return { message: "Failed to create Razorpay order", status: false };
      }

      return {
        message: "Order created successfully",
        status: true,
        data: {
          id: response.id,
          amount: response.amount, // This will be in paise
          amount_in_rupees: cart.totalPrice, // For client reference
          currency: response.currency,
          status: response.status
        }
      };

    } catch (error:any) {
      set.status = 500;
      console.error('Payment order creation error:', error);
      return {
        message: error.message || "Internal server error",
        status: false
      };
    }
  },
  {
    detail: {
      summary: "Create Order for Payment",
      description: "Creates a Razorpay payment order using the user's cart total amount",
      tags: ["Payment"]
    }
  }
)

  .get(
    "/trackorder",
    async ({ set, store, query }) => {
      const userId = (store as StoreType)["id"];

      const { orderId } = query;

      try {
        const order = await OrderModel.findOne(
          {
            user: userId,
            orderId,
          },
          "-user -products.suggestions -dipps"
        )
          .populate("addressId")
          .populate({
            path: "products.productId",
            select: "productName price images",
          })
          // .populate({
          //   path: "deliveryAgent",
          //   select: "name phone",
          // })
          .exec();

        if (!order) {
          set.status = 404;
          return { message: "Order not found", status: false };
        }

        const restaurent = await StoreModel.findOne({});

        if (!restaurent) {
          set.status = 404;
          return { message: "Restaurent not found", status: false };
        }

        const address = await Address.findById(order.addressId);

        if (!address) {
          set.status = 404;
          return { message: "Address not found", status: false };
        }

        const preparingTime = order.preparationTime;
        const preparationStatusUpdatedAt: any = new Date(order.preparedAt);
        const currentTime: any = new Date();

        const elapsedMinutes = Math.floor(
          (currentTime - preparationStatusUpdatedAt) / (1000 * 60)
        );

        const pendingTime = Math.max(preparingTime - elapsedMinutes, 0);

        let buttontext = "Order Placed";
        let description = "Order Confirmed, Preparing Soon\n";

        if (order.status == "pending") {
          buttontext = "Order Placed";
          description = "Order Placed Successfully";
        } else if (order.status == "accepted") {
          buttontext = "Cooking";
          description = "Order is being prepared.";
        } else if (order.status == "picked") {
          buttontext = "Out for Delivery";
          description = "Your order is on the way!";
        } else if (order.status == "delivered") {
          buttontext = "Delivered";
          description = "Your order has arrived";
        } else if (order.status == "rejected") {
          buttontext = "Cancelled";
          description = "Order has been Cancelled";
        }

        return {
          message: "Order Fetched Successfully",
          status: true,
          order,
          pendingTime,
          buttontext,
          description,
          cords: {
            lat: restaurent.latitude,
            long: restaurent.longitude,
          },
          mapPolygon: JSON.parse(order.mapPloygonResponse),
        };
      } catch (error) {
        set.status = 500;
        console.log(error);
        return {
          message: "Failed to fetch order",
          status: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      query: t.Object({
        orderId: t.String(),
      }),
      detail: {
        summary: "Track order",
        description: "Get the order details of the authenticated user",
      },
    }
  )
  .get(
    "/haveactiveorder",
    async ({ set, store }) => {
      const userId = (store as StoreType)["id"];

      try {
        const order = await OrderModel.find(
          {
            user: userId,
            status: {
              $nin: ["cancelled", "delivered", "rejected"],
            },
          },
          "orderId _id deliverySeconds status"
        )
          .sort({ createdAt: -1 })
          .lean()
          .exec();

        if (!order) {
          return { message: "Order not found", status: false };
        }

        let buttontext = "Order Placed";
        let description = "Order Confirmed, Preparing Soon\n";

        let stateGif = "uploads/delivery.gif";

        let _orders = order.map((o) => {
          if (o.status == "pending") {
            buttontext = "Order Placed";
            description = "Order Placed Successfully";
          } else if (o.status == "accepted") {
            buttontext = "Cooking";
            description = "Order is being prepared.\n";
          } else if (o.status == "picked") {
            buttontext = "OutFor Delivery";
            description = "Your order is on the way!\n";
          } else if (o.status == "delivered") {
            buttontext = "Delivered";
            description = "Your order has arrived\n";
          }

          return {
            ...o,
            buttontext,
            description,
            stateGif,
          };
        });

        return {
          message: "Order Fetched Successfully",
          status: true,
          order: _orders,
        };
      } catch (error) {
        set.status = 500;
        return {
          message: "Failed to fetch order",
          status: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      detail: {
        summary: "Find if user has an active order",
        description: "Get if the user has an active order",
      },
    }
  )
  .get(
    "/orderhistory",
    async ({ set, store }) => {
      const userId = (store as StoreType)["id"];
  
      try {
        const orders = await OrderModel.find(
          { user: userId },
          "-user"
        )
          .populate({
            path: "addressId",
            select: "flatorHouseno area landmark",
          })
          .sort({ createdAt: -1 })
          .lean();
  
        // Loop through all orders to populate their products
        const ordersWithPopulatedProducts = await Promise.all(
          orders.map(async (order) => {
            const populatedProducts = await Promise.all(
              order.products.map(async (item) => {
                // Try normal product
                const normal = await Product.findById(item.productId)
                  .select("productName brand images")
                  .populate("brand", "name")
                  .lean();
  
                if (normal) {
                  return {
                    ...item,
                    productId: {
                      _id: normal._id,
                      productName: normal.productName,
                      brand: normal.brand,
                      images: normal.images,
                      isCombo: false,
                    },
                  };
                }
  
                // Try combo product
                const combo = await ComboOffer.findById(item.productId)
                  .select("comboName image comboPrice")
                  .lean();
  
                if (combo) {
                  return {
                    ...item,
                    productId: {
                      _id: combo._id,
                      productName: combo.comboName,
                      brand: { name: "Combo Offer" },
                      images: [combo.image],
                      isCombo: true,
                    },
                  };
                }
  
                // Not found
                return {
                  ...item,
                  productId: null,
                };
              })
            );
  
            return {
              ...order,
              products: populatedProducts,
            };
          })
        );
  
        return {
          message: "Order Fetched Successfully",
          status: true,
          orders: ordersWithPopulatedProducts,
        };
      } catch (error) {
        set.status = 500;
        return {
          message: "Failed to fetch order",
          status: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      detail: {
        summary: "Get order history",
        description: "Get the order history of the authenticated user",
      },
    }
  )  
  
  .get(
    "/:id",
    async ({ params }) => {
      try {
        const { id } = params;
  
        const order = await OrderModel.findById(id)
          .populate({
            path: "addressId",
            select: "receiverName landmark area flatorHouseno receiverMobile",
          })
          .lean(); // Make it plain JS object
  
        if (!order) {
          return { message: "Order not found", status: false };
        }
  
        // Loop through products to populate each productId
        const populatedProducts = await Promise.all(
          order.products.map(async (item) => {
            let normal = await Product.findById(item.productId)
              .select("productName brand images")
              .populate("brand", "name")
              .lean();
  
            if (normal) {
              return {
                ...item,
                productId: {
                  _id: normal._id,
                  productName: normal.productName,
                  brand: normal.brand,
                  images: normal.images,
                  isCombo: false,
                },
              };
            }
  
            // Try combo product if normal not found
            let combo = await ComboOffer.findById(item.productId)
              .select("comboName image comboPrice")
              .lean();
  
            if (combo) {
              return {
                ...item,
                productId: {
                  _id: combo._id,
                  productName: combo.comboName,
                  brand: { name: "Combo Offer" },
                  images: [combo.image],
                  isCombo: true,
                },
              };
            }
  
            // If neither found
            return {
              ...item,
              productId: null,
            };
          })
        );
  
        return {
          message: "Order Fetched Successfully",
          data: {
            ...order,
            products: populatedProducts,
          },
          status: true,
        };
      } catch (error:any) {
        console.error("Error fetching order:", error);
        return {
          error: error.message,
          status: false,
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      detail: {
        summary: "Get a Order by id",
      },
    }
  )
  .post(
    "/cancel/:orderId",
    async ({ params, store, set }) => {
      const userId = (store as StoreType)["id"];
  
      try {
        const { orderId } = params;
  
        // Find the order with product details
        const order = await OrderModel.findOne({ _id: orderId, user: userId })
          .populate('products.productId');
  
        if (!order) {
          set.status = 404;
          return { message: "Order not found", status: false };
        }
  
        // Check if order can be cancelled
        const cancelableStatus = ["pending", "accepted", "processing"];
        if (!cancelableStatus.includes(order.status)) {
          set.status = 400;
          return {
            message: `Order cannot be cancelled in its current state (${order.status})`,
            status: false
          };
        }
  
        const user = await User.findById(order?.user);
        if (!user) {
          set.status = 404;
          return { message: "User not found", status: false };
        }
  
        let refundDetails = null;
  
        // Handle refund for Razorpay payments
        if (order.paymentMethod === "Online" && order.razorPayId) {
          try {
            // Validate totalPrice
            if (order.totalPrice <= 0) {
              set.status = 400;
              return {
                message: "Cannot refund order with zero or negative amount",
                status: false
              };
            }
  
            // Check if payment is captured
            const paymentResponse = await axios.get(
              `https://api.razorpay.com/v1/payments/${order.razorPayId}`,
              {
                auth: {
                  username: process.env.RAZORPAY_KEY_ID || 'YOUR_KEY_ID',
                  password: process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET',
                },
              }
            );
  
            const payment = paymentResponse.data;
            if (payment.status !== 'captured') {
              set.status = 400;
              return {
                message: "Payment not captured yet, cannot process refund",
                status: false
              };
            }
  
            // Process refund
            const refundResponse = await axios.post(
              `https://api.razorpay.com/v1/payments/${order.razorPayId}/refund`,
              {
                amount: Math.round(order.totalPrice * 100), // Convert to paise
                speed: "normal",
                notes: {
                  reason: `Order ${order.orderId} cancelled by user ${user.username}`,
                  cancelled_by: user._id.toString(),
                },
              },
              {
                auth: {
                  username: process.env.RAZORPAY_KEY_ID || 'YOUR_KEY_ID',
                  password: process.env.RAZORPAY_KEY_SECRET || 'YOUR_KEY_SECRET',
                },
              }
            );
  
            refundDetails = refundResponse.data;
  
            // Update order with refund details
            order.refunded = true;
            order.refundedAmount = order.totalPrice;
            order.refundedAt = new Date();
          } catch (refundError) {
            console.error('Refund error:', refundError);
            set.status = 500;
            return {
              message: "Failed to process refund",
              status: false,
              error: refundError instanceof Error ? refundError.message : "Unknown refund error",
            };
          }
        }
  
        // Restore product quantities
        const stockUpdates = []; // Track for rollback
        for (const item of order.products) {
          const product = await Product.findById(item.productId);
          if (product) {
            stockUpdates.push({ product, quantity: item.quantity });
            product.stock += item.quantity;
            await product.save();
          }
        }
  
        // Update order status
        order.status = "cancelled";
        await order.save();
  
        // Send notifications
        await sendNotification(
          user.fcmToken,
          "Order Cancelled",
          `Your order ${order.orderId} has been cancelled. ${
            refundDetails ? "Refund has been initiated." : "Contact support for assistance."
          }`
        );
          // Save notification to Notifications collection
      const notification = new NotificationModel({
        userId: new mongoose.Types.ObjectId(userId), // Changed from 'user' to 'userId'
        title: 'Order Cancelled',
        description: `Your order ${order.orderId} has been cancelled. ${
          refundDetails ? "Refund has been initiated." : "Contact support for assistance."}`, // Changed from 'content' to 'description'
        type: "order",
        orderId: order._id // Added reference to the order
      });
      await notification.save();
  
        broadcastMessage(
          `Order ${order.orderId} cancelled by ${user.username}`
        );
  
        return {
          message: "Order cancelled successfully",
          status: true,
          orderStatus: order.status,
          refundStatus: refundDetails ? refundDetails.status : null
        };
      } catch (error) {
        console.error('Order cancellation error:', error);
        set.status = 500;
        return {
          message: "Failed to cancel order",
          status: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      params: t.Object({
        orderId: t.String({
          pattern: `^[a-fA-F0-9]{24}$`,
          error: "Invalid order ID",
        }),
      }),
      detail: {
        summary: "Cancel Order by id",
        description: "Cancels an order, restores product stock quantities, and processes a refund for Razorpay payments if applicable",
        responses: {
          200: {
            description: "Order cancelled successfully",
            content: {
              "application/json": {
                example: {
                  message: "Order cancelled successfully",
                  status: true,
                  orderStatus: "cancelled",
                  refundStatus: "processed"
                }
              }
            }
          },
          400: {
            description: "Order cannot be cancelled or refund already processed"
          },
          404: {
            description: "Order or user not found"
          },
          500: {
            description: "Internal server error during cancellation"
          }
        }
      },
    }
  )