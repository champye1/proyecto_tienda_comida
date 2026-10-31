export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      categories: {
        Row: {
          created_at: string;
          id: string;
          is_active: boolean;
          name: string;
          position: number;
          restaurant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name: string;
          position?: number;
          restaurant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          is_active?: boolean;
          name?: string;
          position?: number;
          restaurant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      option_groups: {
        Row: {
          created_at: string;
          id: string;
          max_select: number;
          min_select: number;
          name: string;
          position: number;
          product_id: string;
          restaurant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          max_select?: number;
          min_select?: number;
          name: string;
          position?: number;
          product_id: string;
          restaurant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          max_select?: number;
          min_select?: number;
          name?: string;
          position?: number;
          product_id?: string;
          restaurant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "option_groups_product_fkey";
            columns: ["restaurant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["restaurant_id", "id"];
          },
          {
            foreignKeyName: "option_groups_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      options: {
        Row: {
          created_at: string;
          extra_price: number;
          id: string;
          is_available: boolean;
          name: string;
          option_group_id: string;
          position: number;
          restaurant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          extra_price?: number;
          id?: string;
          is_available?: boolean;
          name: string;
          option_group_id: string;
          position?: number;
          restaurant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          extra_price?: number;
          id?: string;
          is_available?: boolean;
          name?: string;
          option_group_id?: string;
          position?: number;
          restaurant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "options_option_group_fkey";
            columns: ["restaurant_id", "option_group_id"];
            isOneToOne: false;
            referencedRelation: "option_groups";
            referencedColumns: ["restaurant_id", "id"];
          },
          {
            foreignKeyName: "options_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_counters: {
        Row: {
          created_at: string;
          last_number: number;
          restaurant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          last_number?: number;
          restaurant_id: string;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          last_number?: number;
          restaurant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_counters_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: true;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          created_at: string;
          id: string;
          line_total: number;
          order_created_at: string;
          order_id: string;
          product_id: string | null;
          product_name: string;
          quantity: number;
          restaurant_id: string;
          selected_options: NonNullable<Json>;
          unit_price: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          line_total: number;
          order_created_at: string;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          quantity: number;
          restaurant_id: string;
          selected_options?: NonNullable<Json>;
          unit_price: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          line_total?: number;
          order_created_at?: string;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          quantity?: number;
          restaurant_id?: string;
          selected_options?: NonNullable<Json>;
          unit_price?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_fkey";
            columns: ["order_id", "order_created_at"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "created_at"];
          },
          {
            foreignKeyName: "order_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          address: string | null;
          created_at: string;
          customer_name: string;
          customer_phone: string;
          delivery_fee: number;
          id: string;
          notes: string | null;
          order_number: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          restaurant_id: string;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
          tracking_token: string;
          type: Database["public"]["Enums"]["order_type"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          created_at?: string;
          customer_name: string;
          customer_phone: string;
          delivery_fee?: number;
          id?: string;
          notes?: string | null;
          order_number: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          restaurant_id: string;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
          tracking_token?: string;
          type: Database["public"]["Enums"]["order_type"];
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          customer_name?: string;
          customer_phone?: string;
          delivery_fee?: number;
          id?: string;
          notes?: string | null;
          order_number?: number;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          restaurant_id?: string;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          total?: number;
          tracking_token?: string;
          type?: Database["public"]["Enums"]["order_type"];
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          category_id: string;
          created_at: string;
          description: string | null;
          id: string;
          image_url: string | null;
          is_available: boolean;
          name: string;
          position: number;
          price: number;
          restaurant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          category_id: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_available?: boolean;
          name: string;
          position?: number;
          price: number;
          restaurant_id: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string;
          created_at?: string;
          description?: string | null;
          id?: string;
          image_url?: string | null;
          is_available?: boolean;
          name?: string;
          position?: number;
          price?: number;
          restaurant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_category_fkey";
            columns: ["restaurant_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["restaurant_id", "id"];
          },
          {
            foreignKeyName: "products_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      restaurant_members: {
        Row: {
          created_at: string;
          id: string;
          restaurant_id: string;
          role: Database["public"]["Enums"]["member_role"];
          updated_at: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          restaurant_id: string;
          role?: Database["public"]["Enums"]["member_role"];
          updated_at?: string;
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          restaurant_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          updated_at?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "restaurant_members_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      restaurants: {
        Row: {
          address: string | null;
          created_at: string;
          delivery_enabled: boolean;
          delivery_fee: number;
          description: string | null;
          id: string;
          is_active: boolean;
          is_open: boolean;
          logo_url: string | null;
          min_order: number;
          name: string;
          phone: string | null;
          pickup_enabled: boolean;
          primary_color: string;
          slug: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          created_at?: string;
          delivery_enabled?: boolean;
          delivery_fee?: number;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_open?: boolean;
          logo_url?: string | null;
          min_order?: number;
          name: string;
          phone?: string | null;
          pickup_enabled?: boolean;
          primary_color?: string;
          slug: string;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          delivery_enabled?: boolean;
          delivery_fee?: number;
          description?: string | null;
          id?: string;
          is_active?: boolean;
          is_open?: boolean;
          logo_url?: string | null;
          min_order?: number;
          name?: string;
          phone?: string | null;
          pickup_enabled?: boolean;
          primary_color?: string;
          slug?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      can_manage_restaurant_file: { Args: { p_object_name: string }; Returns: boolean };
      create_order: {
        Args: {
          p_address: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_items: Json;
          p_notes: string;
          p_payment_method: Database["public"]["Enums"]["payment_method"];
          p_restaurant_slug: string;
          p_type: Database["public"]["Enums"]["order_type"];
        };
        Returns: {
          order_id: string;
          order_number: number;
          total: number;
          tracking_token: string;
        }[];
      };
      create_restaurant: {
        Args: {
          p_address?: string;
          p_description?: string;
          p_name: string;
          p_phone?: string;
          p_slug: string;
        };
        Returns: {
          address: string | null;
          created_at: string;
          delivery_enabled: boolean;
          delivery_fee: number;
          description: string | null;
          id: string;
          is_active: boolean;
          is_open: boolean;
          logo_url: string | null;
          min_order: number;
          name: string;
          phone: string | null;
          pickup_enabled: boolean;
          primary_color: string;
          slug: string;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "restaurants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      format_clp: { Args: { p_amount: number }; Returns: string };
      get_order_by_token: { Args: { p_token: string }; Returns: Json };
      get_public_menu: { Args: { p_slug: string }; Returns: Json };
      get_sales_report: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string };
        Returns: Json;
      };
      is_reserved_slug: { Args: { p_slug: string }; Returns: boolean };
      is_restaurant_member: { Args: { p_restaurant_id: string }; Returns: boolean };
      is_restaurant_owner: { Args: { p_restaurant_id: string }; Returns: boolean };
      is_restaurant_public: { Args: { p_restaurant_id: string }; Returns: boolean };
      is_slug_available: { Args: { p_slug: string }; Returns: string };
      is_valid_order_transition: {
        Args: {
          p_from: Database["public"]["Enums"]["order_status"];
          p_to: Database["public"]["Enums"]["order_status"];
        };
        Returns: boolean;
      };
      order_status_label: {
        Args: { p_status: Database["public"]["Enums"]["order_status"] };
        Returns: string;
      };
      reorder_menu_items: { Args: { p_ids: string[]; p_kind: string }; Returns: undefined };
      update_order_status: {
        Args: { p_order_id: string; p_status: Database["public"]["Enums"]["order_status"] };
        Returns: {
          address: string | null;
          created_at: string;
          customer_name: string;
          customer_phone: string;
          delivery_fee: number;
          id: string;
          notes: string | null;
          order_number: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          restaurant_id: string;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
          tracking_token: string;
          type: Database["public"]["Enums"]["order_type"];
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "orders";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
    };
    Enums: {
      member_role: "owner" | "staff";
      order_status: "pending" | "confirmed" | "preparing" | "ready" | "delivered" | "cancelled";
      order_type: "delivery" | "pickup";
      payment_method: "cash" | "transfer";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      member_role: ["owner", "staff"],
      order_status: ["pending", "confirmed", "preparing", "ready", "delivered", "cancelled"],
      order_type: ["delivery", "pickup"],
      payment_method: ["cash", "transfer"],
    },
  },
} as const;
