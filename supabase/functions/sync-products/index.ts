import { createClient } from "npm:@supabase/supabase-js@2";

type Unit = "g" | "ml" | "szt.";

interface Product {
  external_id: number;
  name: string;
  gramatura: number;
  base_unit: Unit;
}

interface RecipeIngredient {
  product_external_id: number;
  ingredient_external_id: number;
  ingredient_name: string;
  netto: number | null;
  brutto: number | null;
  ingredient_unit: Unit;
}

interface SyncPayload {
  sync_token: string;
  products?: Product[];
  ingredients?: RecipeIngredient[];
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json(
        { error: "Method not allowed" },
        { status: 405 }
      );
    }

    const body: SyncPayload = await req.json();

    const expectedToken = Deno.env.get("SYNC_TOKEN");

    if (!expectedToken || body.sync_token !== expectedToken) {
      return Response.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey =
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Brak konfiguracji Supabase");
    }

    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
    );

    let productsCount = 0;
    let ingredientsCount = 0;

    if (body.products?.length) {
      const { error } = await supabase
        .from("Products")
        .upsert(body.products, {
          onConflict: "external_id"
        });

      if (error) {
        throw new Error(`Products: ${error.message}`);
      }

      productsCount = body.products.length;
    }

    if (body.ingredients?.length) {
      const { error } = await supabase
        .from("Recipe_ingredients")
        .upsert(body.ingredients, {
          onConflict:
            "product_external_id,ingredient_external_id"
        });

      if (error) {
        throw new Error(
          `Recipe_ingredients: ${error.message}`
        );
      }

      ingredientsCount = body.ingredients.length;
    }

    return Response.json({
      success: true,
      products: productsCount,
      ingredients: ingredientsCount
    });
  } catch (error) {
    console.error(error);

    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Unknown error"
      },
      { status: 500 }
    );
  }
});
