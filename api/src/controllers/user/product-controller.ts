import { StoreType } from "@/types";
import { add, format } from "date-fns";
import Elysia, { t } from "elysia";
import { Types } from "mongoose";
import { Product } from "../../models/product";
import { Favorites } from "../../models/user/favorites-model";
import { DiscountOffer, FlatOffer, MRPOffer, NegotiateOffer } from "@/models/offer-model";
import { User } from "@/models/user-model";

export const productController = new Elysia({
  prefix: "/products",
  detail: {
    tags: ["User - Product"],
  },
})
.get(
  "/",
  async ({ query }) => {
    const { page, limit, q, rating, userId, category, brand, minPrice, maxPrice } = query;

    const _limit = parseInt(limit as any) || 10;
    const _page = parseInt(page as any) || 1;

    let matchFilter: any = { active: true, isDeleted: false };

    if (q) {
      matchFilter.$or = [{ productName: { $regex: q, $options: "i" } }];
    }

    if (rating) {
      const ratingNumber = parseInt(rating, 10);
      if (ratingNumber >= 1 && ratingNumber <= 5) {
        matchFilter.ratings = ratingNumber;
      }
    }

    if (minPrice || maxPrice) {
      matchFilter.price = {};
      if (minPrice) matchFilter.price.$gte = parseFloat(minPrice);
      if (maxPrice) matchFilter.price.$lte = parseFloat(maxPrice);
    }

    try {
      const categoryIds = category
        ? category.split(',').map((id: string) => new Types.ObjectId(id.trim()))
        : [];

      const brandIds = brand
        ? brand.split(',').map((id: string) => new Types.ObjectId(id.trim()))
        : [];

      const aggregationPipeline: any[] = [
        { $match: matchFilter },
        {
          $lookup: {
            from: "productcategories",
            localField: "category",
            foreignField: "_id",
            as: "categoryDetails",
          },
        },
        { $unwind: "$categoryDetails" },
        {
          $lookup: {
            from: "brands",
            localField: "brand",
            foreignField: "_id",
            as: "brandDetails",
          },
        },
        { $unwind: "$brandDetails" },
        {
          $addFields: {
            available: {
              $cond: [{ $gt: ["$stock", 0] }, true, false]
            }
          },
        },
        {
          $project: {
            _id: 1,
            productName: 1,
            price: 1,
            ratings: 1,
            strikePrice: 1,
            images: 1,
            discount: 1,
            onMRP: 1,
            description: 1,
            categoryId: "$categoryDetails._id",
            categoryName: "$categoryDetails.name",
            brandId: "$brandDetails._id",
            brandName: "$brandDetails.name",
            available: 1
          }
        }
      ];

      const allProducts = await Product.aggregate(aggregationPipeline);

      let userFavorites: string[] = [];

      if (userId) {
        const favorites = await Favorites.findOne({ user: userId });
        userFavorites = favorites?.products?.map((p: any) => p.toString()) || [];
      }

      const total = allProducts.length;
      const paginatedProducts = allProducts.slice((_page - 1) * _limit, _page * _limit).map(product => ({
        ...product,
        favorite: userFavorites.includes(product._id.toString()),
      }));

      return {
        data: paginatedProducts,
        total,
        page: _page,
        limit: _limit,
        status: true,
      };
    } catch (error) {
      console.error(error);
      return {
        error,
        status: false,
        message: "Something went wrong",
      };
    }
  },
  {
    detail: {
      summary: "Get all active products with filters",
      description: "Supports filtering by multiple categories, brands, price ranges, and ratings. Categories and brands can be comma-separated for multiple values."
    },
    query: t.Object({
      page: t.Optional(t.Number({ default: 1 })),
      limit: t.Optional(t.Number({ default: 10 })),
      q: t.Optional(t.String({ default: "" })),
      rating: t.Optional(t.String()),
      userId: t.Optional(t.String()),
      category: t.Optional(t.String({ description: "Comma-separated category IDs" })),
      brand: t.Optional(t.String({ description: "Comma-separated brand IDs" })),
      minPrice: t.Optional(t.String()),
      maxPrice: t.Optional(t.String()),
    }),
  }
)



  .get(
    "/topseller",
    async ({ query }) => {
      const { page, limit, userId } = query;

      let _limit = limit || 10;
      let _page = page || 1;

      let filter: any = { active: true, topSeller: true };

      try {
        let currentServerTime = format(new Date(), "HH:mm");

        if (process.env.ENV === "PROD") {
          const updatedTime = add(new Date(), { hours: 5, minutes: 30 });
          currentServerTime = format(updatedTime, "HH:mm");
        }

        let userFavorites: String[] = [];

        if (userId) {
          const favorites = await Favorites.findOne({ user: userId });
          userFavorites = favorites?.products || [];
        }

        const products = await Product.aggregate([
          { $match: filter },
          {
            $lookup: {
              from: "timings",
              localField: "timing",
              foreignField: "_id",
              as: "timingDetails",
            },
          },
          {
            $addFields: {
              timingDetails: {
                $ifNull: ["$timingDetails", []],
              },
              available: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: "$timingDetails",
                        as: "timing",
                        cond: {
                          $and: [
                            { $lte: ["$$timing.startTime", currentServerTime] },
                            { $gte: ["$$timing.endTime", currentServerTime] },
                          ],
                        },
                      },
                    },
                  },
                  0,
                ],
              },
            },
          },
          {
            $match: {
              available: true,
            },
          },
          {
            $lookup: {
              from: "productcategories",
              localField: "category",
              foreignField: "_id",
              as: "categoryDetails",
            },
          },
          { $unwind: "$categoryDetails" },
          {
            $match: {
              "categoryDetails.active": true, 
            },
          },
          {
            $addFields: {
              favorite: {
                $in: ["$_id", userFavorites],
              },
            },
          },
          {
            $project: {
              productName: 1,
              price: 1,
              ratings: 1,
              images: 1,
              description: 1,
              type: 1,
              available: 1,
              favorite: 1,
            },
          },
          { $skip: (_page - 1) * _limit },
          { $limit: _limit },
        ]);

        const total = await Product.countDocuments(filter);
        return {
          data: products,
          total,
          page: _page,
          limit: _limit,
          status: true,
        };
      } catch (error) {
        console.error(error);
        return {
          error,
          status: false,
          message: "Something went wrong",
        };
      }
    },
    {
      detail: {
        summary: "Get all topseller products",
      },
      query: t.Object({
        page: t.Optional(t.Number({ default: 1 })),
        limit: t.Optional(t.Number({ default: 10 })),
        userId: t.Optional(t.String()),
      }),
    }
  )
  .get(
    "/:id",
    async ({ params, query, store }) => {
      try {
        const { id } = params;
        const userId = (store as StoreType)["id"];
  
        // First, get the product details
        const product: any = await Product.findById(id)
          .populate({
            path: "category",
            select: "name categoryNumber",
          })
          .populate({
            path: "brand",
            select: "name",
          })
          .exec();
  
        if (!product) {
          return {
            error: "Product not found",
            status: false,
          };
        }
  
        // Check if the product is active in different offer types
        const [flatOffers, negotiateOffers, discountOffers, mrpOffers] = await Promise.all([
          FlatOffer.find({ "items.productId": id }).lean(),
          NegotiateOffer.find({ "items.productId": id }).lean(),
          DiscountOffer.find({ "items.productId": id }).lean(),
          MRPOffer.find({ "items.productId": id }).lean(),
        ]);
  
        // Helper function to check if product is active in any of the offers
        const isProductActiveInOffers = (offers: any[]) => {
          return offers.some(offer => 
            offer.items.some((item: any) => 
              item.productId.toString() === id && item.active !== false
            )
          );
        };
  
        const isActiveInFlat = isProductActiveInOffers(flatOffers);
        const isActiveInNegotiate = isProductActiveInOffers(negotiateOffers);
        const isActiveInDiscount = isProductActiveInOffers(discountOffers);
        const isActiveInMRP = isProductActiveInOffers(mrpOffers);
  
        // Get user favorites
        let userFavorites: String[] = [];
        if (userId) {
          const favorites = await Favorites.findOne({ user: userId });
          userFavorites = favorites?.products || [];
        }
  
        // Create a new product object with modified offer fields based on active status
        const newProduct = {
          ...product._doc,
          favorite: userFavorites.includes(product._id.toString()),
          // Modify offer fields based on active status in respective offers
          flat: isActiveInFlat ? product._doc.flat : 0,
          negotiate: isActiveInNegotiate ? product._doc.negotiate : false,
          discount: isActiveInDiscount ? product._doc.discount : 0,
          onMRP: isActiveInMRP ? product._doc.onMRP : 0,
          negotiateLimit: isActiveInNegotiate ? product._doc.negotiateLimit : 0,
        };
  
        return {
          message: "Product Fetched Successfully",
          data: newProduct,
          status: true,
        };
      } catch (error) {
        console.error(error);
        return {
          error,
          status: "error",
        };
      }
    },
    {
      params: t.Object({
        id: t.String(),
      }),
      query: t.Object({
        userId: t.Optional(t.String()),
      }),
      detail: {
        summary: "Get a product by id",
        description: "Fetches a product by ID and checks its active status in different offer types (flat, negotiate, discount, mrp). Adjusts offer-related fields in response if product is inactive in any offer type. Properly checks through items array in each offer.",
      },
    }
  )
  .get(
    "/search",
    async ({ query, store }) => {
      const { page, limit, q } = query;
      const userId = (store as StoreType)["id"];

      let _limit = limit || 10;
      let _page = page || 1;

      let filter: any = { active: true, stock:{$gt:0}  };

      if (q) {
        filter.productName = {
          $regex: q.trim().split("").join(".*"),
          $options: "i",
        };
      }

      let userFavorites: String[] = [];

      try {
        if (userId) {
          const favorites = await Favorites.findOne({ user: userId });
          userFavorites = favorites?.products || [];
        }


        const mergedFilter = { ...filter };

        let productsPromise = Product.aggregate([
          { $match: mergedFilter },
          {
            $addFields: {
              favorite: {
                $in: ["$_id", userFavorites],
              },
            },
          },
          {
            $group: {
              _id: "$_id",
              productDetails: {
                $first: "$$ROOT", // Get the first product document
              },
            },
          },
          {
            $replaceRoot: { newRoot: "$productDetails" }, // Replace root with product details
          },
          {
            $project: {
              productName: 1,
              price: 1,
              ratings: 1,
              strikePrice:1,
              images: 1,
              description: 1,
              favorite: 1,
            },
          },
          { $skip: (_page - 1) * _limit },
          { $limit: _limit },
        ]);

        const totalPromise = Product.countDocuments(filter);

        const [products, total] = await Promise.all([
          productsPromise,
          totalPromise,
        ]);
        return {
          data: products,
          total,
          page: _page,
          limit: _limit,
          status: true,
        };
      } catch (error) {
        console.error(error);
        return {
          error,
          status: false,
          message: "Something went wrong",
        };
      }
    },
    {
      detail: {
        summary: "Search through all products",
      },
      query: t.Object({
        page: t.Optional(t.Number({ default: 1 })),
        limit: t.Optional(t.Number({ default: 10 })),
        q: t.Optional(t.String({ default: "" })),
      }),
    }
  )
  .get(
    "/negotiate",
    async ({ query,store }) => {
      const {productId, amount } = query;
      const userId = (store as StoreType)["id"];
      if (!productId) {
        return { status: false, message: "Missing required query params (userId or productId)" };
      }
  
      try {
        const user = await User.findById(userId);
        if (!user) {
          return { status: false, message: "User not found" };
        }
  
        const product = await Product.findById(productId);
        if (!product) {
          return { status: false, message: "Product not found" };
        }
  
        const offer = await NegotiateOffer.findOne({ isActive: true });
        if (!offer) {
          return { status: false, message: "No negotiate offer configured" };
        }
      //@ts-ignore
        const maxAttempts = offer.noOfAttempts;
        let existingAttempt = user.attempts.find(attempt => attempt.productId === productId);
  
        let currentAttempts = 0;
        if (existingAttempt) {
          currentAttempts = existingAttempt.attempts.length;
        }
  
        // Return attempt info if no amount provided
        if (!amount) {
          return {
            status: true,
            message: "Negotiation status info",
            maxAttempts,
            attemptsCount: currentAttempts,
            attempts: existingAttempt ? existingAttempt.attempts : [],
          };
        }
  
        if (currentAttempts >= maxAttempts) {
          return {
            status: false,
            message: "Negotiation attempt limit reached",
            maxAttempts,
            attemptsCount: currentAttempts,
            attempts: existingAttempt ? existingAttempt.attempts : [],
          };
        }
  
        const userAmount = parseFloat(amount);
        const limit = product.negotiateLimit;
        const mrp = product.price;
        //@ts-ignore
        const matchedItem = offer.items.find(item => item.productId.toString() === productId);

        if (!matchedItem) {
          return {
            status: false,
            message: "No negotiation config found for this product"
          };
        }
        
        const successPercentage = matchedItem.successPercentage;
        const failurePercentage = matchedItem.failurePercentage;
        
  
        let negotiatedPrice = mrp;
        let message = "";
        let isSuccess = userAmount >= limit;
  
        // First attempt logic
        if (currentAttempts === 0) {
          if (isSuccess) {
            message = userAmount === limit
              ? "Negotiation successful (equal to limit)"
              : "Negotiation successful (above limit)";
            negotiatedPrice = Math.max(
              limit,
              mrp - (mrp * successPercentage / 100) // Apply success % to MRP
            );
          } else {
            message = "Negotiation failed (below limit)";
            negotiatedPrice = Math.max(
              limit,
              mrp - (mrp * failurePercentage / 100) // Apply failure % to MRP
            );
          }
        }
        // Subsequent attempts
        else {    //@ts-ignore
          const lastPrice = existingAttempt.attempts[currentAttempts - 1].amount;
  
          if (isSuccess) {
            message = userAmount === limit
              ? "Negotiation successful (equal to limit)"
              : "Negotiation successful (above limit)";
            negotiatedPrice = Math.max(
              limit,
              lastPrice - (lastPrice * successPercentage / 100)
            );
          } else {
            message = "Negotiation failed (below limit)";
            negotiatedPrice = Math.max(
              limit,
              lastPrice - (lastPrice * failurePercentage / 100)
            );
          }
        }
  
        // Record the attempt
        if (existingAttempt) {
          existingAttempt.attempts.push({
            amount: negotiatedPrice,
            attemptNumber: currentAttempts + 1,
          });
        } else {
          user.attempts.push({
            productId: productId,
            attempts: [
              {
                amount: negotiatedPrice,
                attemptNumber: 1,
              }
            ]
          });
        }
  
        await user.save();
  
        // Ensure the response includes the updated attempts
        return {
          status: true,
          message,
          negotiatedPrice: parseFloat(negotiatedPrice.toFixed(2)),
          attemptsCount: currentAttempts + 1,
          maxAttempts,
          attempts: existingAttempt ? existingAttempt.attempts : user.attempts.find(attempt => attempt.productId === productId)?.attempts || [],
        };
  
      } catch (error) {
        console.error(error);
        return {
          status: false,
          message: "Negotiation failed",
              //@ts-ignore
          error: error.message,
        };
      }
    },
    {
      query: t.Object({
        productId: t.String(),
        amount: t.Optional(t.String())
      }),
      detail: {
        summary: "Negotiate price or fetch negotiation status",
      },
    }
  )

  .get(
    "/complementary",
    async ({ query }) => {
      const { page, limit, q } = query;
  
      const _limit = limit || 10;
      const _page = page || 1;
  
      let matchFilter: any = { active: true, isDeleted: false };
  
      // Filter by max MRP (onMRP <= q)
      if (q) {
        const maxMRP = parseFloat(q);
        if (!isNaN(maxMRP)) {
          matchFilter.price = { $lte: maxMRP };
        }
      }
  
      try {
        const totalPromise = Product.countDocuments(matchFilter);
  
        const aggregationPipeline: any[] = [
          {
            $match: matchFilter,
          },
          {
            $lookup: {
              from: "productcategories",
              localField: "category",
              foreignField: "_id",
              as: "categoryDetails",
            },
          },
          {
            $unwind: "$categoryDetails",
          },
          {
            $match: {
              "categoryDetails.active": true,
            },
          },
          {
            $lookup: {
              from: "brands",
              localField: "brand",
              foreignField: "_id",
              as: "brandDetails",
            },
          },
          {
            $unwind: "$brandDetails",
          },
          {
            $match: {
              "brandDetails.active": true,
            },
          },
          {
            $sort: {
              productName: 1,
            },
          },
          {
            $project: {
              _id: 1,
              productName: 1,
              price: 1,
              ratings: 1,
              strikePrice: 1,
              images: 1,
              discount: 1,
              onMRP: 1,
              description: 1,
              categoryId: "$categoryDetails._id",
              categoryName: "$categoryDetails.name",
              brandId: "$brandDetails._id",
              brandName: "$brandDetails.name",
            },
          },
          {
            $skip: (_page - 1) * _limit,
          },
          {
            $limit: _limit,
          },
        ];
  
        const [total, products] = await Promise.all([
          totalPromise,
          Product.aggregate(aggregationPipeline),
        ]);
  
        return {
          data: products, // Now a flat array
          total,
          page: _page,
          limit: _limit,
          status: true,
        };
      } catch (error) {
        console.error(error);
        return {
          error,
          status: false,
          message: "Something went wrong",
        };
      }
    },
    {
      detail: {
        summary: "Get active products filtered by onMRP (max price)",
        description: "If `q` is passed, it returns products with `price <= q`.",
      },
      query: t.Object({
        page: t.Optional(t.Number({ default: 1 })),
        limit: t.Optional(t.Number({ default: 10 })),
        q: t.Optional(t.String({ description: "Max MRP filter" })),
      }),
    }
  )
  .get(
    "/flat-discount",
    async ({ query }) => {
      const { userId, productId } = query;
  
      let filter: any = { active: true, flat: { $gt: 0 } };
  
      // Add exclusion if excludeProductId is provided
      if (productId) {
        filter._id = { $ne: new Types.ObjectId(productId) };
      }
  
      try {
        let userFavorites: String[] = [];
  
        if (userId) {
          const favorites = await Favorites.findOne({ user: userId });
          userFavorites = favorites?.products || [];
        }
  
        const products = await Product.aggregate([
          { $match: filter },
          {
            $lookup: {
              from: "productcategories",
              localField: "category",
              foreignField: "_id",
              as: "categoryDetails",
            },
          },
          { $unwind: "$categoryDetails" },
          {
            $match: {
              "categoryDetails.active": true,
            },
          },
          {
            $addFields: {
              favorite: {
                $in: ["$_id", userFavorites],
              },
            },
          },
          {
            $project: {
              productName: 1,
              price: 1,
              flat: 1,
              strikePrice: 1,
              ratings: 1,
              images: 1,
              description: 1,
              type: 1,
              favorite: 1,
              stock:1
            },
          },
        ]);
  
        const total = await Product.countDocuments(filter);
        return {
          data: products,
          total,
          status: true,
        };
      } catch (error) {
        console.error(error);
        return {
          error,
          status: false,
          message: "Something went wrong",
        };
      }
    },
    {
      detail: {
        summary: "Get products with flat discounts (optionally exclude one product)",
      },
      query: t.Object({
        userId: t.Optional(t.String()),
        productId: t.Optional(t.String()),
      }),
    }
  )
  
  