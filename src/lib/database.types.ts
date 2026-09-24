export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string
          email: string
          full_name: string | null
          profession: string | null
          default_currency: string
          enabled_currencies: string[]
          timezone: string
          date_format: string
          avatar_path: string | null
          manual_rates: Json
          monthly_save_target: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id: string
          email: string
          full_name?: string | null
          profession?: string | null
          default_currency?: string
          enabled_currencies?: string[]
          timezone?: string
          date_format?: string
          avatar_path?: string | null
          manual_rates?: Json
          monthly_save_target?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          email?: string
          full_name?: string | null
          profession?: string | null
          default_currency?: string
          enabled_currencies?: string[]
          timezone?: string
          date_format?: string
          avatar_path?: string | null
          manual_rates?: Json
          monthly_save_target?: number | null
          created_at?: string
          updated_at?: string
        }
        Relationships: []
      }
      account_valuations: {
        Row: {
          id: string
          user_id: string
          account_id: string
          value: number
          as_of: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id: string
          value: number
          as_of?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          account_id?: string
          value?: number
          as_of?: string
          created_at?: string
        }
        Relationships: []
      }
      tax_payments: {
        Row: {
          id: string
          user_id: string
          tax_year: string
          kind: 'tds' | 'advance' | 'with_return' | 'other'
          description: string | null
          amount: number
          paid_on: string
          created_at: string
        }
        Insert: {
          id?: string
          user_id: string
          tax_year: string
          kind: 'tds' | 'advance' | 'with_return' | 'other'
          description?: string | null
          amount: number
          paid_on?: string
          created_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          tax_year?: string
          kind?: 'tds' | 'advance' | 'with_return' | 'other'
          description?: string | null
          amount?: number
          paid_on?: string
          created_at?: string
        }
        Relationships: []
      }
      net_worth_snapshots: {
        Row: {
          user_id: string
          month: string
          net_worth: number
          assets: number
          liabilities: number
          currency: string
          updated_at: string
        }
        Insert: {
          user_id: string
          month: string
          net_worth: number
          assets: number
          liabilities: number
          currency: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          month?: string
          net_worth?: number
          assets?: number
          liabilities?: number
          currency?: string
          updated_at?: string
        }
        Relationships: []
      }
      accounts: {
        Row: {
          id: string
          user_id: string
          name: string
          type: 'checking' | 'savings' | 'credit_card' | 'virtual_card' | 'cash' | 'investment' | 'mfs' | 'multi_currency'
          balance: number
          currency: string
          is_active: boolean
          current_value: number | null
          value_updated_at: string | null
          investment_kind: 'startup' | 'savings_certificate' | 'dps' | 'fdr' | 'stocks' | 'fund' | 'crypto' | 'gold' | 'property' | 'land' | 'vehicle' | 'valuables' | 'other' | null
          maturity_date: string | null
          tax_rebate: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          type: 'checking' | 'savings' | 'credit_card' | 'virtual_card' | 'cash' | 'investment' | 'mfs' | 'multi_currency'
          balance?: number
          currency?: string
          is_active?: boolean
          current_value?: number | null
          value_updated_at?: string | null
          investment_kind?: 'startup' | 'savings_certificate' | 'dps' | 'fdr' | 'stocks' | 'fund' | 'crypto' | 'gold' | 'property' | 'land' | 'vehicle' | 'valuables' | 'other' | null
          maturity_date?: string | null
          tax_rebate?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          type?: 'checking' | 'savings' | 'credit_card' | 'virtual_card' | 'cash' | 'investment' | 'mfs' | 'multi_currency'
          balance?: number
          currency?: string
          is_active?: boolean
          current_value?: number | null
          value_updated_at?: string | null
          investment_kind?: 'startup' | 'savings_certificate' | 'dps' | 'fdr' | 'stocks' | 'fund' | 'crypto' | 'gold' | 'property' | 'land' | 'vehicle' | 'valuables' | 'other' | null
          maturity_date?: string | null
          tax_rebate?: boolean
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
      payees: {
        Row: {
          id: string
          user_id: string
          name: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          name?: string
          notes?: string | null
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
          payee_id: string | null
          payer_id: string | null
          transfer_pair_id: string | null
          split_group_id: string | null
          loan_payment_id: string | null
          amount: number
          type: 'income' | 'expense'
          currency: string
          custom_rate: number | null
          charge_amount: number | null
          title: string
          description: string | null
          transaction_date: string
          timezone: string | null
          notes: string | null
          receipt_path: string | null
          is_adjustment: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          account_id: string
          category_id?: string | null
          payee_id?: string | null
          payer_id?: string | null
          transfer_pair_id?: string | null
          split_group_id?: string | null
          loan_payment_id?: string | null
          amount: number
          type: 'income' | 'expense'
          currency?: string
          custom_rate?: number | null
          charge_amount?: number | null
          title: string
          description?: string | null
          transaction_date?: string
          timezone?: string | null
          notes?: string | null
          receipt_path?: string | null
          is_adjustment?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          account_id?: string
          category_id?: string | null
          payee_id?: string | null
          payer_id?: string | null
          transfer_pair_id?: string | null
          split_group_id?: string | null
          loan_payment_id?: string | null
          amount?: number
          type?: 'income' | 'expense'
          currency?: string
          custom_rate?: number | null
          charge_amount?: number | null
          title?: string
          description?: string | null
          transaction_date?: string
          timezone?: string | null
          notes?: string | null
          receipt_path?: string | null
          is_adjustment?: boolean
          created_at?: string
          updated_at?: string
        }
        Relationships: [
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
            foreignKeyName: 'transactions_loan_payment_id_fkey'
            columns: ['loan_payment_id']
            isOneToOne: false
            referencedRelation: 'loan_payments'
            referencedColumns: ['id']
          },
        ]
      }
      budgets: {
        Row: {
          id: string
          user_id: string
          category_id: string
          period_type: 'monthly' | 'yearly'
          period_start: string
          period_end: string
          amount: number
          currency: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          category_id: string
          period_type: 'monthly' | 'yearly'
          period_start: string
          period_end: string
          amount: number
          currency?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          category_id?: string
          period_type?: 'monthly' | 'yearly'
          period_start?: string
          period_end?: string
          amount?: number
          currency?: string
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
      recurring_transactions: {
        Row: {
          id: string
          user_id: string
          account_id: string
          category_id: string | null
          payee_id: string | null
          name: string
          amount: number
          type: 'income' | 'expense'
          frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
          interval_count: number
          next_date: string
          end_type: 'never' | 'on_date' | 'after_occurrences'
          end_date: string | null
          max_occurrences: number | null
          occurrences_count: number
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
          payee_id?: string | null
          name: string
          amount: number
          type: 'income' | 'expense'
          frequency: 'daily' | 'weekly' | 'monthly' | 'yearly'
          interval_count?: number
          next_date: string
          end_type?: 'never' | 'on_date' | 'after_occurrences'
          end_date?: string | null
          max_occurrences?: number | null
          occurrences_count?: number
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
          payee_id?: string | null
          name?: string
          amount?: number
          type?: 'income' | 'expense'
          frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly'
          interval_count?: number
          next_date?: string
          end_type?: 'never' | 'on_date' | 'after_occurrences'
          end_date?: string | null
          max_occurrences?: number | null
          occurrences_count?: number
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
            foreignKeyName: 'recurring_transactions_payee_id_fkey'
            columns: ['payee_id']
            isOneToOne: false
            referencedRelation: 'payees'
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
          lender_borrower: string
          due_date: string | null
          payee_id: string | null
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
          lender_borrower: string
          due_date?: string | null
          payee_id?: string | null
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
          lender_borrower?: string
          due_date?: string | null
          payee_id?: string | null
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
    }
    Views: Record<never, never>
    Functions: Record<never, never>
    Enums: Record<never, never>
    CompositeTypes: Record<never, never>
  }
}
