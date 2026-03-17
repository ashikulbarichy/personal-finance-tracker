/*
  # Personal Finance Tracker Database Schema

  ## Overview
  Complete database schema for a personal finance tracking application with multi-user support.

  ## New Tables Created

  ### 1. profiles
  - `id` (uuid, FK to auth.users) - User profile ID
  - `email` (text) - User email
  - `full_name` (text) - User's full name
  - `created_at` (timestamptz) - Profile creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 2. accounts
  - `id` (uuid, PK) - Account ID
  - `user_id` (uuid, FK) - Owner of the account
  - `name` (text) - Account name (e.g., "Chase Checking")
  - `type` (text) - Account type (checking, savings, credit_card, cash, investment)
  - `balance` (decimal) - Current account balance
  - `currency` (text) - Currency code (USD, EUR, etc.)
  - `is_active` (boolean) - Whether account is active
  - `created_at` (timestamptz) - Account creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 3. categories
  - `id` (uuid, PK) - Category ID
  - `user_id` (uuid, FK) - Owner of the category
  - `name` (text) - Category name
  - `type` (text) - income or expense
  - `icon` (text) - Icon identifier
  - `color` (text) - Color hex code
  - `parent_category_id` (uuid, FK) - Parent category for subcategories
  - `created_at` (timestamptz) - Category creation timestamp

  ### 4. tags
  - `id` (uuid, PK) - Tag ID
  - `user_id` (uuid, FK) - Owner of the tag
  - `name` (text) - Tag name
  - `color` (text) - Color hex code
  - `created_at` (timestamptz) - Tag creation timestamp

  ### 5. transactions
  - `id` (uuid, PK) - Transaction ID
  - `user_id` (uuid, FK) - Owner of the transaction
  - `account_id` (uuid, FK) - Associated account
  - `category_id` (uuid, FK) - Associated category
  - `amount` (decimal) - Transaction amount
  - `type` (text) - income or expense
  - `description` (text) - Transaction description
  - `transaction_date` (date) - Date of transaction
  - `tags` (text[]) - Array of tag IDs
  - `notes` (text) - Additional notes
  - `created_at` (timestamptz) - Transaction creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 6. budgets
  - `id` (uuid, PK) - Budget ID
  - `user_id` (uuid, FK) - Owner of the budget
  - `category_id` (uuid, FK) - Associated category
  - `name` (text) - Budget name
  - `amount` (decimal) - Budget amount
  - `period` (text) - Budget period (monthly, quarterly, annual)
  - `start_date` (date) - Budget start date
  - `end_date` (date) - Budget end date
  - `rollover` (boolean) - Whether to rollover unused amount
  - `created_at` (timestamptz) - Budget creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 7. recurring_transactions
  - `id` (uuid, PK) - Recurring transaction ID
  - `user_id` (uuid, FK) - Owner of the recurring transaction
  - `account_id` (uuid, FK) - Associated account
  - `category_id` (uuid, FK) - Associated category
  - `name` (text) - Recurring transaction name
  - `amount` (decimal) - Transaction amount
  - `type` (text) - income or expense
  - `frequency` (text) - Frequency (daily, weekly, monthly, yearly)
  - `next_date` (date) - Next occurrence date
  - `is_active` (boolean) - Whether recurring transaction is active
  - `description` (text) - Description
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 8. savings_goals
  - `id` (uuid, PK) - Savings goal ID
  - `user_id` (uuid, FK) - Owner of the goal
  - `account_id` (uuid, FK) - Associated account
  - `name` (text) - Goal name
  - `target_amount` (decimal) - Target amount to save
  - `current_amount` (decimal) - Current saved amount
  - `deadline` (date) - Goal deadline
  - `is_completed` (boolean) - Whether goal is achieved
  - `created_at` (timestamptz) - Goal creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### 9. loans
  - `id` (uuid, PK) - Loan ID
  - `user_id` (uuid, FK) - Owner of the loan record
  - `account_id` (uuid, FK) - Associated account
  - `name` (text) - Loan name
  - `type` (text) - lending or borrowing
  - `principal_amount` (decimal) - Original loan amount
  - `current_balance` (decimal) - Current outstanding balance
  - `interest_rate` (decimal) - Annual interest rate percentage
  - `lender_borrower` (text) - Name of lender or borrower
  - `due_date` (date) - Loan due date
  - `is_active` (boolean) - Whether loan is active
  - `created_at` (timestamptz) - Loan creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ## Security
  - Row Level Security (RLS) enabled on all tables
  - Policies ensure users can only access their own data
  - Authentication required for all operations
  - Separate policies for SELECT, INSERT, UPDATE, and DELETE operations

  ## Notes
  1. All monetary values use DECIMAL type for precision
  2. All tables include created_at and updated_at timestamps
  3. Soft deletes implemented via is_active flags where applicable
  4. Foreign key constraints ensure data integrity
  5. Indexes created on frequently queried columns for performance
*/

-- Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email text UNIQUE NOT NULL,
  full_name text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create accounts table
CREATE TABLE IF NOT EXISTS accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('checking', 'savings', 'credit_card', 'cash', 'investment')),
  balance decimal(15, 2) DEFAULT 0,
  currency text DEFAULT 'USD',
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  icon text DEFAULT 'circle',
  color text DEFAULT '#6B7280',
  parent_category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

-- Create tags table
CREATE TABLE IF NOT EXISTS tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  color text DEFAULT '#6B7280',
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, name)
);

-- Create transactions table
CREATE TABLE IF NOT EXISTS transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  amount decimal(15, 2) NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  description text,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  tags text[] DEFAULT '{}',
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create budgets table
CREATE TABLE IF NOT EXISTS budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  amount decimal(15, 2) NOT NULL,
  period text NOT NULL CHECK (period IN ('monthly', 'quarterly', 'annual')),
  start_date date NOT NULL,
  end_date date NOT NULL,
  rollover boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create recurring_transactions table
CREATE TABLE IF NOT EXISTS recurring_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  name text NOT NULL,
  amount decimal(15, 2) NOT NULL,
  type text NOT NULL CHECK (type IN ('income', 'expense')),
  frequency text NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  next_date date NOT NULL,
  is_active boolean DEFAULT true,
  description text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create savings_goals table
CREATE TABLE IF NOT EXISTS savings_goals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_amount decimal(15, 2) NOT NULL,
  current_amount decimal(15, 2) DEFAULT 0,
  deadline date,
  is_completed boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create loans table
CREATE TABLE IF NOT EXISTS loans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  account_id uuid REFERENCES accounts(id) ON DELETE SET NULL,
  name text NOT NULL,
  type text NOT NULL CHECK (type IN ('lending', 'borrowing')),
  principal_amount decimal(15, 2) NOT NULL,
  current_balance decimal(15, 2) NOT NULL,
  interest_rate decimal(5, 2) DEFAULT 0,
  lender_borrower text NOT NULL,
  due_date date,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_account_id ON transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(transaction_date);
CREATE INDEX IF NOT EXISTS idx_categories_user_id ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_transactions_user_id ON recurring_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_savings_goals_user_id ON savings_goals(user_id);
CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans(user_id);

-- Enable Row Level Security
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE savings_goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE loans ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Users can view own profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Accounts policies
CREATE POLICY "Users can view own accounts"
  ON accounts FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own accounts"
  ON accounts FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own accounts"
  ON accounts FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own accounts"
  ON accounts FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Categories policies
CREATE POLICY "Users can view own categories"
  ON categories FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own categories"
  ON categories FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own categories"
  ON categories FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own categories"
  ON categories FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Tags policies
CREATE POLICY "Users can view own tags"
  ON tags FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own tags"
  ON tags FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own tags"
  ON tags FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own tags"
  ON tags FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Transactions policies
CREATE POLICY "Users can view own transactions"
  ON transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own transactions"
  ON transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own transactions"
  ON transactions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own transactions"
  ON transactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Budgets policies
CREATE POLICY "Users can view own budgets"
  ON budgets FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own budgets"
  ON budgets FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own budgets"
  ON budgets FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own budgets"
  ON budgets FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Recurring transactions policies
CREATE POLICY "Users can view own recurring transactions"
  ON recurring_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own recurring transactions"
  ON recurring_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own recurring transactions"
  ON recurring_transactions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own recurring transactions"
  ON recurring_transactions FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Savings goals policies
CREATE POLICY "Users can view own savings goals"
  ON savings_goals FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own savings goals"
  ON savings_goals FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own savings goals"
  ON savings_goals FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own savings goals"
  ON savings_goals FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Loans policies
CREATE POLICY "Users can view own loans"
  ON loans FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own loans"
  ON loans FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own loans"
  ON loans FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own loans"
  ON loans FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Function to automatically create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_accounts_updated_at BEFORE UPDATE ON accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_transactions_updated_at BEFORE UPDATE ON transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_budgets_updated_at BEFORE UPDATE ON budgets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_recurring_transactions_updated_at BEFORE UPDATE ON recurring_transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_savings_goals_updated_at BEFORE UPDATE ON savings_goals
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_loans_updated_at BEFORE UPDATE ON loans
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();