/*
  # Add Default Categories Function

  ## Overview
  Creates a function to automatically add default categories when a new user signs up.

  ## Changes
  1. Creates a function that inserts default expense and income categories
  2. Updates the user creation trigger to call this function
  
  ## Default Categories
  
  ### Expense Categories
  - Groceries (red)
  - Dining Out (orange)
  - Transportation (blue)
  - Utilities (teal)
  - Entertainment (purple)
  - Healthcare (pink)
  - Shopping (yellow)
  - Other Expenses (gray)
  
  ### Income Categories
  - Salary (green)
  - Freelance (blue)
  - Investment (teal)
  - Other Income (gray)

  ## Notes
  - Default categories help new users get started quickly
  - Users can modify or delete these categories as needed
  - Categories are only created once during user signup
*/

-- Function to create default categories for new users
CREATE OR REPLACE FUNCTION public.create_default_categories(user_id uuid)
RETURNS void AS $$
BEGIN
  -- Insert default expense categories
  INSERT INTO public.categories (user_id, name, type, icon, color) VALUES
    (user_id, 'Groceries', 'expense', 'shopping-cart', '#EF4444'),
    (user_id, 'Dining Out', 'expense', 'utensils', '#F59E0B'),
    (user_id, 'Transportation', 'expense', 'car', '#3B82F6'),
    (user_id, 'Utilities', 'expense', 'home', '#14B8A6'),
    (user_id, 'Entertainment', 'expense', 'music', '#8B5CF6'),
    (user_id, 'Healthcare', 'expense', 'heart', '#EC4899'),
    (user_id, 'Shopping', 'expense', 'gift', '#FBBF24'),
    (user_id, 'Other Expenses', 'expense', 'circle', '#6B7280');
  
  -- Insert default income categories
  INSERT INTO public.categories (user_id, name, type, icon, color) VALUES
    (user_id, 'Salary', 'income', 'briefcase', '#10B981'),
    (user_id, 'Freelance', 'income', 'briefcase', '#3B82F6'),
    (user_id, 'Investment', 'income', 'trending-up', '#14B8A6'),
    (user_id, 'Other Income', 'income', 'circle', '#6B7280');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update the handle_new_user function to create default categories
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (new.id, new.email, new.raw_user_meta_data->>'full_name');
  
  -- Create default categories for the new user
  PERFORM public.create_default_categories(new.id);
  
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;