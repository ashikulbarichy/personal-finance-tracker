/*
  # Seed Data Function for Demo Account

  ## Overview
  Creates a function to generate comprehensive demo/seed data for testing and exploration.
  This function can be called with any user ID to populate their account with sample data.

  ## Demo Data Includes
  1. Multiple accounts (checking, savings, credit card, cash)
  2. Sample transactions across 3 months
  3. Active budgets for common categories
  4. Recurring transactions (subscriptions, bills)
  5. Savings goals with progress
  6. Sample loans (both borrowing and lending)

  ## Usage
  Call this function after creating a demo user:
  SELECT create_demo_data('user-uuid-here');

  ## Notes
  - This function is idempotent - it checks for existing data
  - All amounts and dates are realistic examples
  - Data spans the last 3 months for realistic reporting
*/

CREATE OR REPLACE FUNCTION public.create_demo_data(target_user_id uuid)
RETURNS void AS $$
DECLARE
  checking_account_id uuid;
  savings_account_id uuid;
  credit_card_id uuid;
  cash_account_id uuid;
  
  salary_category_id uuid;
  groceries_category_id uuid;
  dining_category_id uuid;
  transport_category_id uuid;
  utilities_category_id uuid;
  entertainment_category_id uuid;
  shopping_category_id uuid;
BEGIN
  -- Check if user already has data
  IF EXISTS (SELECT 1 FROM accounts WHERE user_id = target_user_id) THEN
    RAISE NOTICE 'User already has data. Skipping seed data creation.';
    RETURN;
  END IF;

  -- Get category IDs
  SELECT id INTO salary_category_id FROM categories WHERE user_id = target_user_id AND name = 'Salary' LIMIT 1;
  SELECT id INTO groceries_category_id FROM categories WHERE user_id = target_user_id AND name = 'Groceries' LIMIT 1;
  SELECT id INTO dining_category_id FROM categories WHERE user_id = target_user_id AND name = 'Dining Out' LIMIT 1;
  SELECT id INTO transport_category_id FROM categories WHERE user_id = target_user_id AND name = 'Transportation' LIMIT 1;
  SELECT id INTO utilities_category_id FROM categories WHERE user_id = target_user_id AND name = 'Utilities' LIMIT 1;
  SELECT id INTO entertainment_category_id FROM categories WHERE user_id = target_user_id AND name = 'Entertainment' LIMIT 1;
  SELECT id INTO shopping_category_id FROM categories WHERE user_id = target_user_id AND name = 'Shopping' LIMIT 1;

  -- Create Accounts
  INSERT INTO accounts (user_id, name, type, balance, currency) VALUES
    (target_user_id, 'Main Checking', 'checking', 5420.50, 'USD'),
    (target_user_id, 'Emergency Savings', 'savings', 12000.00, 'USD'),
    (target_user_id, 'Chase Credit Card', 'credit_card', -850.25, 'USD'),
    (target_user_id, 'Cash Wallet', 'cash', 180.00, 'USD')
  RETURNING id INTO checking_account_id;

  -- Get all account IDs
  SELECT id INTO checking_account_id FROM accounts WHERE user_id = target_user_id AND name = 'Main Checking';
  SELECT id INTO savings_account_id FROM accounts WHERE user_id = target_user_id AND name = 'Emergency Savings';
  SELECT id INTO credit_card_id FROM accounts WHERE user_id = target_user_id AND name = 'Chase Credit Card';
  SELECT id INTO cash_account_id FROM accounts WHERE user_id = target_user_id AND name = 'Cash Wallet';

  -- Create Transactions (last 3 months)
  -- Month 1 (2 months ago)
  INSERT INTO transactions (user_id, account_id, category_id, amount, type, description, transaction_date) VALUES
    (target_user_id, checking_account_id, salary_category_id, 4500.00, 'income', 'Monthly Salary', CURRENT_DATE - INTERVAL '60 days'),
    (target_user_id, checking_account_id, groceries_category_id, 245.80, 'expense', 'Whole Foods', CURRENT_DATE - INTERVAL '58 days'),
    (target_user_id, credit_card_id, dining_category_id, 85.50, 'expense', 'Restaurant Downtown', CURRENT_DATE - INTERVAL '57 days'),
    (target_user_id, checking_account_id, utilities_category_id, 120.00, 'expense', 'Electric Bill', CURRENT_DATE - INTERVAL '55 days'),
    (target_user_id, credit_card_id, shopping_category_id, 299.99, 'expense', 'New Shoes', CURRENT_DATE - INTERVAL '54 days'),
    (target_user_id, checking_account_id, transport_category_id, 60.00, 'expense', 'Gas Station', CURRENT_DATE - INTERVAL '52 days'),
    (target_user_id, credit_card_id, entertainment_category_id, 45.00, 'expense', 'Movie Theater', CURRENT_DATE - INTERVAL '50 days'),
    (target_user_id, checking_account_id, groceries_category_id, 198.45, 'expense', 'Supermarket', CURRENT_DATE - INTERVAL '48 days');

  -- Month 2 (1 month ago)
  INSERT INTO transactions (user_id, account_id, category_id, amount, type, description, transaction_date) VALUES
    (target_user_id, checking_account_id, salary_category_id, 4500.00, 'income', 'Monthly Salary', CURRENT_DATE - INTERVAL '30 days'),
    (target_user_id, checking_account_id, groceries_category_id, 267.30, 'expense', 'Whole Foods', CURRENT_DATE - INTERVAL '28 days'),
    (target_user_id, credit_card_id, dining_category_id, 120.00, 'expense', 'Italian Restaurant', CURRENT_DATE - INTERVAL '27 days'),
    (target_user_id, checking_account_id, utilities_category_id, 135.50, 'expense', 'Electric + Water', CURRENT_DATE - INTERVAL '25 days'),
    (target_user_id, cash_account_id, entertainment_category_id, 50.00, 'expense', 'Concert Tickets', CURRENT_DATE - INTERVAL '24 days'),
    (target_user_id, checking_account_id, transport_category_id, 65.00, 'expense', 'Gas Station', CURRENT_DATE - INTERVAL '22 days'),
    (target_user_id, credit_card_id, shopping_category_id, 450.00, 'expense', 'Home Depot', CURRENT_DATE - INTERVAL '20 days'),
    (target_user_id, checking_account_id, groceries_category_id, 189.20, 'expense', 'Grocery Store', CURRENT_DATE - INTERVAL '18 days');

  -- Current Month
  INSERT INTO transactions (user_id, account_id, category_id, amount, type, description, transaction_date) VALUES
    (target_user_id, checking_account_id, salary_category_id, 4500.00, 'income', 'Monthly Salary', CURRENT_DATE - INTERVAL '5 days'),
    (target_user_id, checking_account_id, groceries_category_id, 156.75, 'expense', 'Whole Foods', CURRENT_DATE - INTERVAL '4 days'),
    (target_user_id, credit_card_id, dining_category_id, 95.30, 'expense', 'Sushi Restaurant', CURRENT_DATE - INTERVAL '3 days'),
    (target_user_id, checking_account_id, utilities_category_id, 115.00, 'expense', 'Electric Bill', CURRENT_DATE - INTERVAL '2 days'),
    (target_user_id, cash_account_id, entertainment_category_id, 30.00, 'expense', 'Coffee Shop', CURRENT_DATE - INTERVAL '1 day');

  -- Create Budgets
  INSERT INTO budgets (user_id, category_id, name, amount, period, start_date, end_date) VALUES
    (target_user_id, groceries_category_id, 'Monthly Groceries', 600.00, 'monthly', DATE_TRUNC('month', CURRENT_DATE), DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'),
    (target_user_id, dining_category_id, 'Dining Out Budget', 300.00, 'monthly', DATE_TRUNC('month', CURRENT_DATE), DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'),
    (target_user_id, transport_category_id, 'Transportation', 200.00, 'monthly', DATE_TRUNC('month', CURRENT_DATE), DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day'),
    (target_user_id, entertainment_category_id, 'Entertainment Fund', 250.00, 'monthly', DATE_TRUNC('month', CURRENT_DATE), DATE_TRUNC('month', CURRENT_DATE) + INTERVAL '1 month' - INTERVAL '1 day');

  -- Create Recurring Transactions
  INSERT INTO recurring_transactions (user_id, account_id, category_id, name, amount, type, frequency, next_date, description) VALUES
    (target_user_id, credit_card_id, entertainment_category_id, 'Netflix Subscription', 15.99, 'expense', 'monthly', CURRENT_DATE + INTERVAL '10 days', 'Streaming service'),
    (target_user_id, credit_card_id, entertainment_category_id, 'Spotify Premium', 10.99, 'expense', 'monthly', CURRENT_DATE + INTERVAL '15 days', 'Music streaming'),
    (target_user_id, checking_account_id, utilities_category_id, 'Internet Bill', 79.99, 'expense', 'monthly', CURRENT_DATE + INTERVAL '20 days', 'Home internet'),
    (target_user_id, checking_account_id, utilities_category_id, 'Phone Bill', 55.00, 'expense', 'monthly', CURRENT_DATE + INTERVAL '25 days', 'Mobile phone'),
    (target_user_id, checking_account_id, salary_category_id, 'Monthly Salary', 4500.00, 'income', 'monthly', CURRENT_DATE + INTERVAL '25 days', 'Regular paycheck');

  -- Create Savings Goals
  INSERT INTO savings_goals (user_id, account_id, name, target_amount, current_amount, deadline) VALUES
    (target_user_id, savings_account_id, 'Emergency Fund', 15000.00, 12000.00, CURRENT_DATE + INTERVAL '6 months'),
    (target_user_id, savings_account_id, 'Vacation to Europe', 5000.00, 1200.00, CURRENT_DATE + INTERVAL '10 months'),
    (target_user_id, savings_account_id, 'New Laptop', 2000.00, 800.00, CURRENT_DATE + INTERVAL '4 months');

  -- Create Loans
  INSERT INTO loans (user_id, account_id, name, type, principal_amount, current_balance, interest_rate, lender_borrower, due_date) VALUES
    (target_user_id, checking_account_id, 'Student Loan', 'borrowing', 25000.00, 18500.00, 4.5, 'Federal Student Aid', CURRENT_DATE + INTERVAL '5 years'),
    (target_user_id, NULL, 'Loan to Friend', 'lending', 1000.00, 650.00, 0.0, 'John Smith', CURRENT_DATE + INTERVAL '6 months');

  RAISE NOTICE 'Demo data created successfully for user %', target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;