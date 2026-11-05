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
      coupons: {
        Row: {
          code: string;
          created_at: string;
          customer_phone: string | null;
          ends_at: string | null;
          first_order_only: boolean;
          id: string;
          is_active: boolean;
          kind: string;
          max_uses: number | null;
          min_subtotal: number;
          restaurant_id: string;
          starts_at: string | null;
          updated_at: string;
          uses: number;
          value: number;
        };
        ComputedFields: never;
        Insert: {
          code: string;
          created_at?: string;
          customer_phone?: string | null;
          ends_at?: string | null;
          first_order_only?: boolean;
          id?: string;
          is_active?: boolean;
          kind: string;
          max_uses?: number | null;
          min_subtotal?: number;
          restaurant_id: string;
          starts_at?: string | null;
          updated_at?: string;
          uses?: number;
          value?: number;
        };
        Update: {
          code?: string;
          created_at?: string;
          customer_phone?: string | null;
          ends_at?: string | null;
          first_order_only?: boolean;
          id?: string;
          is_active?: boolean;
          kind?: string;
          max_uses?: number | null;
          min_subtotal?: number;
          restaurant_id?: string;
          starts_at?: string | null;
          updated_at?: string;
          uses?: number;
          value?: number;
        };
        Relationships: [
          {
            foreignKeyName: "coupons_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      loyalty_cards: {
        Row: {
          created_at: string;
          phone: string;
          restaurant_id: string;
          rewards_issued: number;
          stamps: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          phone: string;
          restaurant_id: string;
          rewards_issued?: number;
          stamps?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          phone?: string;
          restaurant_id?: string;
          rewards_issued?: number;
          stamps?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "loyalty_cards_restaurant_id_fkey";
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
          discount: number;
          id: string;
          line_total: number;
          order_created_at: string;
          order_id: string;
          product_id: string | null;
          product_name: string;
          promotion_name: string | null;
          quantity: number;
          restaurant_id: string;
          selected_options: NonNullable<Json>;
          unit_price: number;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          discount?: number;
          id?: string;
          line_total: number;
          order_created_at: string;
          order_id: string;
          product_id?: string | null;
          product_name: string;
          promotion_name?: string | null;
          quantity: number;
          restaurant_id: string;
          selected_options?: NonNullable<Json>;
          unit_price: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          discount?: number;
          id?: string;
          line_total?: number;
          order_created_at?: string;
          order_id?: string;
          product_id?: string | null;
          product_name?: string;
          promotion_name?: string | null;
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
      order_reviews: {
        Row: {
          comment: string | null;
          created_at: string;
          id: string;
          order_id: string;
          rating: number;
          restaurant_id: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          order_id: string;
          rating: number;
          restaurant_id: string;
          updated_at?: string;
        };
        Update: {
          comment?: string | null;
          created_at?: string;
          id?: string;
          order_id?: string;
          rating?: number;
          restaurant_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_reviews_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_reviews_restaurant_id_fkey";
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
          coupon_code: string | null;
          created_at: string;
          customer_name: string;
          customer_phone: string;
          delivery_fee: number;
          discount: number;
          estimated_ready_at: string | null;
          id: string;
          notes: string | null;
          order_number: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_receipt_path: string | null;
          payment_reported_at: string | null;
          payment_status: string;
          restaurant_id: string;
          scheduled_for: string | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          tip: number;
          total: number;
          tracking_token: string;
          type: Database["public"]["Enums"]["order_type"];
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          coupon_code?: string | null;
          created_at?: string;
          customer_name: string;
          customer_phone: string;
          delivery_fee?: number;
          discount?: number;
          estimated_ready_at?: string | null;
          id?: string;
          notes?: string | null;
          order_number: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_receipt_path?: string | null;
          payment_reported_at?: string | null;
          payment_status?: string;
          restaurant_id: string;
          scheduled_for?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          tip?: number;
          total: number;
          tracking_token?: string;
          type: Database["public"]["Enums"]["order_type"];
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          coupon_code?: string | null;
          created_at?: string;
          customer_name?: string;
          customer_phone?: string;
          delivery_fee?: number;
          discount?: number;
          estimated_ready_at?: string | null;
          id?: string;
          notes?: string | null;
          order_number?: number;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          payment_receipt_path?: string | null;
          payment_reported_at?: string | null;
          payment_status?: string;
          restaurant_id?: string;
          scheduled_for?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
          subtotal?: number;
          tip?: number;
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
          is_featured: boolean;
          is_upsell: boolean;
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
          is_featured?: boolean;
          is_upsell?: boolean;
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
          is_featured?: boolean;
          is_upsell?: boolean;
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
      promotions: {
        Row: {
          category_id: string | null;
          created_at: string;
          days: number[];
          end_time: string;
          id: string;
          is_active: boolean;
          kind: string;
          name: string;
          percent: number | null;
          product_id: string | null;
          restaurant_id: string;
          start_time: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          category_id?: string | null;
          created_at?: string;
          days: number[];
          end_time: string;
          id?: string;
          is_active?: boolean;
          kind: string;
          name: string;
          percent?: number | null;
          product_id?: string | null;
          restaurant_id: string;
          start_time: string;
          updated_at?: string;
        };
        Update: {
          category_id?: string | null;
          created_at?: string;
          days?: number[];
          end_time?: string;
          id?: string;
          is_active?: boolean;
          kind?: string;
          name?: string;
          percent?: number | null;
          product_id?: string | null;
          restaurant_id?: string;
          start_time?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "promotions_category_fkey";
            columns: ["restaurant_id", "category_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["restaurant_id", "id"];
          },
          {
            foreignKeyName: "promotions_product_fkey";
            columns: ["restaurant_id", "product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["restaurant_id", "id"];
          },
          {
            foreignKeyName: "promotions_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      restaurant_invitations: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          created_at: string;
          created_by: string | null;
          email: string;
          expires_at: string;
          id: string;
          restaurant_id: string;
          role: Database["public"]["Enums"]["member_role"];
          token_hash: string;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          email: string;
          expires_at?: string;
          id?: string;
          restaurant_id: string;
          role?: Database["public"]["Enums"]["member_role"];
          token_hash: string;
          updated_at?: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          created_at?: string;
          created_by?: string | null;
          email?: string;
          expires_at?: string;
          id?: string;
          restaurant_id?: string;
          role?: Database["public"]["Enums"]["member_role"];
          token_hash?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "restaurant_invitations_restaurant_id_fkey";
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
          google_review_url: string | null;
          id: string;
          is_active: boolean;
          is_open: boolean;
          logo_url: string | null;
          loyalty_enabled: boolean;
          loyalty_reward_kind: string;
          loyalty_reward_value: number;
          loyalty_stamps: number;
          min_order: number;
          name: string;
          opening_hours: Json | null;
          phone: string | null;
          pickup_enabled: boolean;
          prep_time_minutes: number;
          primary_color: string;
          scheduling_days: number;
          slug: string;
          timezone: string;
          tips_enabled: boolean;
          transfer_account_number: string | null;
          transfer_account_type: string | null;
          transfer_bank: string | null;
          transfer_email: string | null;
          transfer_holder: string | null;
          transfer_rut: string | null;
          updated_at: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string | null;
          created_at?: string;
          delivery_enabled?: boolean;
          delivery_fee?: number;
          description?: string | null;
          google_review_url?: string | null;
          id?: string;
          is_active?: boolean;
          is_open?: boolean;
          logo_url?: string | null;
          loyalty_enabled?: boolean;
          loyalty_reward_kind?: string;
          loyalty_reward_value?: number;
          loyalty_stamps?: number;
          min_order?: number;
          name: string;
          opening_hours?: Json | null;
          phone?: string | null;
          pickup_enabled?: boolean;
          prep_time_minutes?: number;
          primary_color?: string;
          scheduling_days?: number;
          slug: string;
          timezone?: string;
          tips_enabled?: boolean;
          transfer_account_number?: string | null;
          transfer_account_type?: string | null;
          transfer_bank?: string | null;
          transfer_email?: string | null;
          transfer_holder?: string | null;
          transfer_rut?: string | null;
          updated_at?: string;
        };
        Update: {
          address?: string | null;
          created_at?: string;
          delivery_enabled?: boolean;
          delivery_fee?: number;
          description?: string | null;
          google_review_url?: string | null;
          id?: string;
          is_active?: boolean;
          is_open?: boolean;
          logo_url?: string | null;
          loyalty_enabled?: boolean;
          loyalty_reward_kind?: string;
          loyalty_reward_value?: number;
          loyalty_stamps?: number;
          min_order?: number;
          name?: string;
          opening_hours?: Json | null;
          phone?: string | null;
          pickup_enabled?: boolean;
          prep_time_minutes?: number;
          primary_color?: string;
          scheduling_days?: number;
          slug?: string;
          timezone?: string;
          tips_enabled?: boolean;
          transfer_account_number?: string | null;
          transfer_account_type?: string | null;
          transfer_bank?: string | null;
          transfer_email?: string | null;
          transfer_holder?: string | null;
          transfer_rut?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      accept_invitation: { Args: { p_token: string }; Returns: string };
      can_manage_restaurant_file: { Args: { p_object_name: string }; Returns: boolean };
      check_coupon: {
        Args: {
          p_code: string;
          p_delivery_fee?: number;
          p_phone?: string;
          p_slug: string;
          p_subtotal: number;
        };
        Returns: Json;
      };
      confirm_order: {
        Args: { p_order_id: string; p_ready_minutes: number };
        Returns: {
          address: string | null;
          coupon_code: string | null;
          created_at: string;
          customer_name: string;
          customer_phone: string;
          delivery_fee: number;
          discount: number;
          estimated_ready_at: string | null;
          id: string;
          notes: string | null;
          order_number: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_receipt_path: string | null;
          payment_reported_at: string | null;
          payment_status: string;
          restaurant_id: string;
          scheduled_for: string | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          tip: number;
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
      coupon_discount: {
        Args: {
          p_at: string;
          p_coupon: Omit<
            Database["public"]["Tables"]["coupons"]["Row"],
            Database["public"]["Tables"]["coupons"]["ComputedFields"]
          >;
          p_delivery_fee: number;
          p_phone: string;
          p_subtotal: number;
        };
        Returns: number;
      };
      create_invitation: {
        Args: { p_email: string; p_restaurant_id: string };
        Returns: {
          expires_at: string;
          token: string;
        }[];
      };
      create_order: {
        Args: {
          p_address: string;
          p_coupon_code?: string;
          p_customer_name: string;
          p_customer_phone: string;
          p_items: Json;
          p_notes: string;
          p_payment_method: Database["public"]["Enums"]["payment_method"];
          p_restaurant_slug: string;
          p_scheduled_for?: string;
          p_tip?: number;
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
          google_review_url: string | null;
          id: string;
          is_active: boolean;
          is_open: boolean;
          logo_url: string | null;
          loyalty_enabled: boolean;
          loyalty_reward_kind: string;
          loyalty_reward_value: number;
          loyalty_stamps: number;
          min_order: number;
          name: string;
          opening_hours: Json | null;
          phone: string | null;
          pickup_enabled: boolean;
          prep_time_minutes: number;
          primary_color: string;
          scheduling_days: number;
          slug: string;
          timezone: string;
          tips_enabled: boolean;
          transfer_account_number: string | null;
          transfer_account_type: string | null;
          transfer_bank: string | null;
          transfer_email: string | null;
          transfer_holder: string | null;
          transfer_rut: string | null;
          updated_at: string;
        };
        SetofOptions: {
          from: "*";
          to: "restaurants";
          isOneToOne: true;
          isSetofReturn: false;
        };
      };
      create_winback_coupon: {
        Args: { p_percent: number; p_phone: string; p_restaurant_id: string };
        Returns: string;
      };
      format_clp: { Args: { p_amount: number }; Returns: string };
      get_customers: {
        Args: { p_restaurant_id: string };
        Returns: {
          first_order: string;
          last_order: string;
          name: string;
          orders: number;
          phone: string;
          stamps: number;
          total_spent: number;
        }[];
      };
      get_invitation: { Args: { p_token: string }; Returns: Json };
      get_order_by_token: { Args: { p_token: string }; Returns: Json };
      get_public_menu: { Args: { p_slug: string }; Returns: Json };
      get_sales_report: {
        Args: { p_from: string; p_restaurant_id: string; p_to: string };
        Returns: Json;
      };
      get_team: {
        Args: { p_restaurant_id: string };
        Returns: {
          email: string;
          is_me: boolean;
          joined_at: string;
          member_id: string;
          role: Database["public"]["Enums"]["member_role"];
          user_id: string;
        }[];
      };
      is_open_at: {
        Args: { p_at?: string; p_hours: Json; p_is_open: boolean; p_tz: string };
        Returns: boolean;
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
      promotion_active_at: {
        Args: { p_at: string; p_days: number[]; p_end: string; p_start: string; p_tz: string };
        Returns: boolean;
      };
      random_coupon_code: { Args: { p_prefix: string }; Returns: string };
      reorder_menu_items: { Args: { p_ids: string[]; p_kind: string }; Returns: undefined };
      report_payment: { Args: { p_receipt_path?: string; p_token: string }; Returns: undefined };
      report_payment_public: { Args: { p_token: string }; Returns: undefined };
      set_order_estimate: {
        Args: { p_order_id: string; p_ready_minutes: number };
        Returns: {
          address: string | null;
          coupon_code: string | null;
          created_at: string;
          customer_name: string;
          customer_phone: string;
          delivery_fee: number;
          discount: number;
          estimated_ready_at: string | null;
          id: string;
          notes: string | null;
          order_number: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_receipt_path: string | null;
          payment_reported_at: string | null;
          payment_status: string;
          restaurant_id: string;
          scheduled_for: string | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          tip: number;
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
      submit_review: {
        Args: { p_comment?: string; p_rating: number; p_token: string };
        Returns: undefined;
      };
      update_order_status: {
        Args: { p_order_id: string; p_status: Database["public"]["Enums"]["order_status"] };
        Returns: {
          address: string | null;
          coupon_code: string | null;
          created_at: string;
          customer_name: string;
          customer_phone: string;
          delivery_fee: number;
          discount: number;
          estimated_ready_at: string | null;
          id: string;
          notes: string | null;
          order_number: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_receipt_path: string | null;
          payment_reported_at: string | null;
          payment_status: string;
          restaurant_id: string;
          scheduled_for: string | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          tip: number;
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
      verify_payment: {
        Args: { p_order_id: string };
        Returns: {
          address: string | null;
          coupon_code: string | null;
          created_at: string;
          customer_name: string;
          customer_phone: string;
          delivery_fee: number;
          discount: number;
          estimated_ready_at: string | null;
          id: string;
          notes: string | null;
          order_number: number;
          payment_method: Database["public"]["Enums"]["payment_method"];
          payment_receipt_path: string | null;
          payment_reported_at: string | null;
          payment_status: string;
          restaurant_id: string;
          scheduled_for: string | null;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          tip: number;
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
