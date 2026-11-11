export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      branch_inventory: {
        Row: {
          branch_id: string
          empty_units: number
          full_units: number
          id: string
          product_id: string
          updated_at: string | null
        }
        Insert: {
          branch_id: string
          empty_units?: number
          full_units?: number
          id?: string
          product_id: string
          updated_at?: string | null
        }
        Update: {
          branch_id?: string
          empty_units?: number
          full_units?: number
          id?: string
          product_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_inventory_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_inventory_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          code: string
          contact_phone: string | null
          created_at: string | null
          id: string
          is_active: boolean
          location_estate: string
          name: string
        }
        Insert: {
          code: string
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          location_estate: string
          name: string
        }
        Update: {
          code?: string
          contact_phone?: string | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          location_estate?: string
          name?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          cylinder_size_kg: number | null
          id: string
          incoming_brand: string | null
          order_id: string
          order_type: Database["public"]["Enums"]["order_type"]
          outgoing_brand: string
          product_id: string | null
          quantity: number
          subtotal_kes: number
          unit_price_kes: number
        }
        Insert: {
          cylinder_size_kg?: number | null
          id?: string
          incoming_brand?: string | null
          order_id: string
          order_type: Database["public"]["Enums"]["order_type"]
          outgoing_brand: string
          product_id?: string | null
          quantity?: number
          subtotal_kes?: number
          unit_price_kes?: number
        }
        Update: {
          cylinder_size_kg?: number | null
          id?: string
          incoming_brand?: string | null
          order_id?: string
          order_type?: Database["public"]["Enums"]["order_type"]
          outgoing_brand?: string
          product_id?: string | null
          quantity?: number
          subtotal_kes?: number
          unit_price_kes?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          assigned_at: string | null
          branch_id: string
          created_at: string | null
          customer_name: string
          customer_phone: string
          delivered_at: string | null
          delivery_address: string | null
          delivery_estate: string | null
          delivery_fee_kes: number
          delivery_status: Database["public"]["Enums"]["delivery_status"]
          id: string
          is_pos_walkin: boolean
          order_number: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_reference: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          rider_comment: string | null
          rider_id: string | null
          sales_rep_id: string | null
          subtotal_kes: number
          total_kes: number
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          branch_id: string
          created_at?: string | null
          customer_name: string
          customer_phone: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_estate?: string | null
          delivery_fee_kes?: number
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          id?: string
          is_pos_walkin?: boolean
          order_number: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          rider_comment?: string | null
          rider_id?: string | null
          sales_rep_id?: string | null
          subtotal_kes?: number
          total_kes?: number
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          branch_id?: string
          created_at?: string | null
          customer_name?: string
          customer_phone?: string
          delivered_at?: string | null
          delivery_address?: string | null
          delivery_estate?: string | null
          delivery_fee_kes?: number
          delivery_status?: Database["public"]["Enums"]["delivery_status"]
          id?: string
          is_pos_walkin?: boolean
          order_number?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_reference?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          rider_comment?: string | null
          rider_id?: string | null
          sales_rep_id?: string | null
          subtotal_kes?: number
          total_kes?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_rider_id_fkey"
            columns: ["rider_id"]
            isOneToOne: false
            referencedRelation: "rider_leaderboard"
            referencedColumns: ["rider_id"]
          },
          {
            foreignKeyName: "orders_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_sales_rep_id_fkey"
            columns: ["sales_rep_id"]
            isOneToOne: false
            referencedRelation: "rider_leaderboard"
            referencedColumns: ["rider_id"]
          },
        ]
      }
      products: {
        Row: {
          accessory_price_kes: number | null
          brand: string
          category: string
          complete_price_kes: number | null
          created_at: string | null
          id: string
          is_active: boolean
          name: string
          refill_price_kes: number
          size_kg: number | null
        }
        Insert: {
          accessory_price_kes?: number | null
          brand: string
          category: string
          complete_price_kes?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          name: string
          refill_price_kes?: number
          size_kg?: number | null
        }
        Update: {
          accessory_price_kes?: number | null
          brand?: string
          category?: string
          complete_price_kes?: number | null
          created_at?: string | null
          id?: string
          is_active?: boolean
          name?: string
          refill_price_kes?: number
          size_kg?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          approval_status: Database["public"]["Enums"]["approval_status"]
          created_at: string | null
          email: string
          full_name: string
          id: string
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string | null
          vehicle_plate: string | null
        }
        Insert: {
          approval_status?: Database["public"]["Enums"]["approval_status"]
          created_at?: string | null
          email: string
          full_name: string
          id: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          vehicle_plate?: string | null
        }
        Update: {
          approval_status?: Database["public"]["Enums"]["approval_status"]
          created_at?: string | null
          email?: string
          full_name?: string
          id?: string
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string | null
          vehicle_plate?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      rider_leaderboard: {
        Row: {
          active_deliveries: number | null
          avg_delivery_minutes: number | null
          completed_deliveries: number | null
          rider_id: string | null
          rider_name: string | null
          total_assigned: number | null
          vehicle_plate: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      current_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      is_staff_approved: { Args: never; Returns: boolean }
    }
    Enums: {
      approval_status: "pending" | "approved" | "rejected"
      delivery_status:
        | "pending"
        | "assigned"
        | "in_transit"
        | "delivered"
        | "cancelled"
      order_type: "refill" | "complete" | "accessory"
      payment_method: "mpesa" | "cash" | "bank_transfer"
      payment_status: "pending" | "paid"
      user_role:
        | "admin"
        | "director"
        | "operator"
        | "sales_rep"
        | "rider"
        | "pending"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
