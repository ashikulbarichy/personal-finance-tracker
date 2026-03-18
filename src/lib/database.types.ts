export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          profession: string | null
          default_currency: string | null
          enabled_currencies: string[] | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          profession?: string | null
          default_currency?: string | null
          enabled_currencies?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          profession?: string | null
          default_currency?: string | null
          enabled_currencies?: string[] | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          id: string
          user_id: string
          name: string
          type: 'checking' | 'savings' | 'credit_card' | 'cash' | 'investment' | 'multi_currency' | 'mfs'
          balance: number
          currency: string
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: 'checking' | 'savings' | 'credit_card' | 'cash' | 'investment' | 'multi_currency' | 'mfs'
          balance?: number
          currency?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: 'checking' | 'savings' | 'credit_card' | 'cash' | 'investment' | 'multi_currency' | 'mfs'
          balance?: number
          currency?: string
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      categories: {
        Row: {
          id: string
          user_id: string
          name: string
          type: 'income' | 'expense'
          icon: string
          color: string
          parent_category_id: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: 'income' | 'expense'
          icon?: string
          color?: string
          parent_category_id?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: 'income' | 'expense'
          icon?: string
          color?: string
          parent_category_id?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'categories_parent_category_id_fkey'
            columns: ['parent_category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      tags: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string
          created_at?: string
        }
        Relationships: []
      }
      payees: {
        Row: {
          id: string
          user_id: string
          name: string
          email: string | null
          phone: string | null
          category: string | null
          notes: string | null
          total_paid: number
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          email?: string | null
          phone?: string | null
          category?: string | null
          notes?: string | null
          total_paid?: number
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          email?: string | null
          phone?: string | null
          category?: string | null
          notes?: string | null
          total_paid?: number
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      transactions: {
        Row: {
          id: string
          user_id: string
          account_id: string
          category_id: string | null
          loan_payment_id: string | null
          budget_id: string | null
          payee_id: string | null
          payer_id: string | null
          amount: number
          type: 'income' | 'expense'
          currency: string
          custom_rate: number | null
          title: string
          description: string | null
          transaction_date: string
          timezone: string | null
          tags: string[]
          group_id: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id: string
          category_id?: string | null
          loan_payment_id?: string | null
          budget_id?: string | null
          payee_id?: string | null
          payer_id?: string | null
          amount: number
          type: 'income' | 'expense'
          currency?: string
          custom_rate?: number | null
          title?: string
          description?: string | null
          transaction_date?: string
          timezone?: string | null
          tags?: string[]
          group_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          account_id?: string
          category_id?: string | null
          loan_payment_id?: string | null
          budget_id?: string | null
          payee_id?: string | null
          payer_id?: string | null
          amount?: number
          type?: 'income' | 'expense'
          currency?: string
          custom_rate?: number | null
          title?: string
          description?: string | null
          transaction_date?: string
          timezone?: string | null
          tags?: string[]
          group_id?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'transactions_payee_id_fkey'
            columns: ['payee_id']
            isOneToOne: false
            referencedRelation: 'payees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transactions_payer_id_fkey'
            columns: ['payer_id']
            isOneToOne: false
            referencedRelation: 'payees'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transactions_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transactions_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'transactions_group_id_fkey'
            columns: ['group_id']
            isOneToOne: false
            referencedRelation: 'transaction_groups'
            referencedColumns: ['id']
          },
        ]
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          category_id: string
          name: string
          amount: number
          period: 'weekly' | 'monthly' | 'quarterly' | 'annual'
          start_date: string
          end_date: string
          rollover: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          category_id: string
          name: string
          amount: number
          period: 'weekly' | 'monthly' | 'quarterly' | 'annual'
          start_date: string
          end_date: string
          rollover?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          category_id?: string
          name?: string
          amount?: number
          period?: 'weekly' | 'monthly' | 'quarterly' | 'annual'
          start_date?: string
          end_date?: string
          rollover?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'budgets_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
        ]
      }
      subscriptions: {
        Row: {
          id: string
          user_id: string
          name: string
          provider: string | null
          plan: string | null
          amount: number
          currency: string
          billing_cycle: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
          category_id: string | null
          account_id: string | null
          start_date: string | null
          renewal_date: string | null
          website: string | null
          notes: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          provider?: string | null
          plan?: string | null
          amount: number
          currency?: string
          billing_cycle?: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
          category_id?: string | null
          account_id?: string | null
          start_date?: string | null
          renewal_date?: string | null
          website?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          provider?: string | null
          plan?: string | null
          amount?: number
          currency?: string
          billing_cycle?: 'weekly' | 'monthly' | 'quarterly' | 'yearly'
          category_id?: string | null
          account_id?: string | null
          start_date?: string | null
          renewal_date?: string | null
          website?: string | null
          notes?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'subscriptions_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'subscriptions_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      recurring_transactions: {
        Row: {
          id: string
          user_id: string
          account_id: string
          category_id: string | null
          subscription_id: string | null
          name: string
          amount: number
          type: 'income' | 'expense'
          frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
          next_date: string
          is_active: boolean
          description: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id: string
          category_id?: string | null
          subscription_id?: string | null
          name: string
          amount: number
          type: 'income' | 'expense'
          frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
          next_date: string
          is_active?: boolean
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          account_id?: string
          category_id?: string | null
          subscription_id?: string | null
          name?: string
          amount?: number
          type?: 'income' | 'expense'
          frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly'
          next_date?: string
          is_active?: boolean
          description?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'recurring_transactions_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recurring_transactions_category_id_fkey'
            columns: ['category_id']
            isOneToOne: false
            referencedRelation: 'categories'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'recurring_transactions_subscription_id_fkey'
            columns: ['subscription_id']
            isOneToOne: false
            referencedRelation: 'subscriptions'
            referencedColumns: ['id']
          },
        ]
      }
      savings_goals: {
        Row: {
          id: string
          user_id: string
          account_id: string | null
          name: string
          timeline: 'short_term' | 'mid_term' | 'long_term'
          target_amount: number
          current_amount: number
          deadline: string | null
          is_completed: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id?: string | null
          name: string
          timeline?: 'short_term' | 'mid_term' | 'long_term'
          target_amount: number
          current_amount?: number
          deadline?: string | null
          is_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          account_id?: string | null
          name?: string
          timeline?: 'short_term' | 'mid_term' | 'long_term'
          target_amount?: number
          current_amount?: number
          deadline?: string | null
          is_completed?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'savings_goals_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      savings_goal_allocations: {
        Row: {
          id: string
          user_id: string
          goal_id: string
          account_id: string
          amount: number
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          goal_id: string
          account_id: string
          amount: number
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          goal_id?: string
          account_id?: string
          amount?: number
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'savings_goal_allocations_goal_id_fkey'
            columns: ['goal_id']
            isOneToOne: false
            referencedRelation: 'savings_goals'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'savings_goal_allocations_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      loans: {
        Row: {
          id: string
          user_id: string
          account_id: string | null
          name: string
          type: 'lending' | 'borrowing'
          principal_amount: number
          current_balance: number
          interest_rate: number
          lender_borrower: string
          due_date: string | null
          is_active: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id?: string | null
          name: string
          type: 'lending' | 'borrowing'
          principal_amount: number
          current_balance: number
          interest_rate?: number
          lender_borrower: string
          due_date?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          account_id?: string | null
          name?: string
          type?: 'lending' | 'borrowing'
          principal_amount?: number
          current_balance?: number
          interest_rate?: number
          lender_borrower?: string
          due_date?: string | null
          is_active?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'loans_account_id_fkey'
            columns: ['account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      loan_payments: {
        Row: {
          id: string
          user_id: string
          loan_id: string
          from_account_id: string | null
          to_account_id: string | null
          amount: number
          payment_type: 'disbursement' | 'repayment'
          payment_date: string
          notes: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          loan_id: string
          from_account_id?: string | null
          to_account_id?: string | null
          amount: number
          payment_type: 'disbursement' | 'repayment'
          payment_date?: string
          notes?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          loan_id?: string
          from_account_id?: string | null
          to_account_id?: string | null
          amount?: number
          payment_type?: 'disbursement' | 'repayment'
          payment_date?: string
          notes?: string | null
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'loan_payments_loan_id_fkey'
            columns: ['loan_id']
            isOneToOne: false
            referencedRelation: 'loans'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loan_payments_from_account_id_fkey'
            columns: ['from_account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
          {
            foreignKeyName: 'loan_payments_to_account_id_fkey'
            columns: ['to_account_id']
            isOneToOne: false
            referencedRelation: 'accounts'
            referencedColumns: ['id']
          },
        ]
      }
      automation_rules: {
        Row: {
          id: string
          user_id: string
          name: string
          description: string | null
          is_active: boolean
          trigger_type: string
          trigger_conditions: Json
          action_type: string
          action_params: Json
          execution_count: number
          last_executed_at: string | null
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          description?: string | null
          is_active?: boolean
          trigger_type: string
          trigger_conditions?: Json
          action_type: string
          action_params?: Json
          execution_count?: number
          last_executed_at?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          description?: string | null
          is_active?: boolean
          trigger_type?: string
          trigger_conditions?: Json
          action_type?: string
          action_params?: Json
          execution_count?: number
          last_executed_at?: string | null
          created_at?: string
        }
        Relationships: []
      }
      automation_logs: {
        Row: {
          id: string
          user_id: string
          rule_id: string
          trigger_data: Json | null
          action_taken: string
          success: boolean
          error_message: string | null
          executed_at: string
        }
        Insert: {
          id?: string
          user_id: string
          rule_id: string
          trigger_data?: Json | null
          action_taken: string
          success?: boolean
          error_message?: string | null
          executed_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          rule_id?: string
          trigger_data?: Json | null
          action_taken?: string
          success?: boolean
          error_message?: string | null
          executed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: 'automation_logs_rule_id_fkey'
            columns: ['rule_id']
            isOneToOne: false
            referencedRelation: 'automation_rules'
            referencedColumns: ['id']
          },
        ]
      }
      transaction_groups: {
        Row: {
          id: string
          user_id: string
          name: string
          color: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          color?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          color?: string
          created_at?: string
        }
        Relationships: []
      }
      exchange_rates: {
        Row: {
          base_currency: string
          rates: Record<string, number>
          provider: string
          fetched_at: string
          expires_at: string
        }
        Insert: {
          base_currency: string
          rates: Record<string, number>
          provider?: string
          fetched_at?: string
          expires_at?: string
        }
        Update: {
          base_currency?: string
          rates?: Record<string, number>
          provider?: string
          fetched_at?: string
          expires_at?: string
        }
        Relationships: []
      }
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
