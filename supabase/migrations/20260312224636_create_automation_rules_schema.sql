/*
  # Automation Rules Schema

  ## Overview
  Creates tables and functions for automation rules that automatically perform actions
  based on specific conditions (triggers).

  ## New Tables

  ### automation_rules
  Stores automation rule definitions
  - `id` (uuid, PK) - Rule ID
  - `user_id` (uuid, FK) - Owner of the rule
  - `name` (text) - Rule name
  - `description` (text) - Rule description
  - `is_active` (boolean) - Whether rule is enabled
  - `trigger_type` (text) - Type of trigger (transaction_created, transaction_amount, date_based, balance_threshold)
  - `trigger_conditions` (jsonb) - Conditions that must be met
  - `action_type` (text) - Type of action (categorize, add_tag, create_budget_alert, move_to_savings, create_transaction)
  - `action_params` (jsonb) - Parameters for the action
  - `execution_count` (integer) - Number of times rule has been executed
  - `last_executed_at` (timestamptz) - Last execution timestamp
  - `created_at` (timestamptz) - Creation timestamp
  - `updated_at` (timestamptz) - Last update timestamp

  ### automation_logs
  Stores execution history of automation rules
  - `id` (uuid, PK) - Log entry ID
  - `user_id` (uuid, FK) - User ID
  - `rule_id` (uuid, FK) - Related rule
  - `trigger_data` (jsonb) - Data that triggered the rule
  - `action_taken` (text) - Description of action taken
  - `success` (boolean) - Whether action succeeded
  - `error_message` (text) - Error message if failed
  - `executed_at` (timestamptz) - Execution timestamp

  ## Example Automation Rules

  1. Auto-categorize transactions based on merchant name
  2. Move percentage to savings when income is received
  3. Alert when budget threshold is reached
  4. Auto-tag recurring transactions
  5. Create monthly transactions automatically
  6. Alert when account balance is low

  ## Security
  - Row Level Security enabled on all tables
  - Users can only access their own rules and logs
*/

-- Create automation_rules table
CREATE TABLE IF NOT EXISTS automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean DEFAULT true,
  trigger_type text NOT NULL CHECK (trigger_type IN (
    'transaction_created',
    'transaction_amount',
    'date_based',
    'balance_threshold',
    'budget_threshold',
    'income_received'
  )),
  trigger_conditions jsonb NOT NULL DEFAULT '{}',
  action_type text NOT NULL CHECK (action_type IN (
    'categorize',
    'add_tag',
    'create_budget_alert',
    'move_to_savings',
    'create_transaction',
    'send_notification'
  )),
  action_params jsonb NOT NULL DEFAULT '{}',
  execution_count integer DEFAULT 0,
  last_executed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create automation_logs table
CREATE TABLE IF NOT EXISTS automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  rule_id uuid REFERENCES automation_rules(id) ON DELETE CASCADE NOT NULL,
  trigger_data jsonb,
  action_taken text NOT NULL,
  success boolean DEFAULT true,
  error_message text,
  executed_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_automation_rules_user_id ON automation_rules(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_rules_trigger_type ON automation_rules(trigger_type);
CREATE INDEX IF NOT EXISTS idx_automation_rules_is_active ON automation_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_automation_logs_user_id ON automation_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_rule_id ON automation_logs(rule_id);
CREATE INDEX IF NOT EXISTS idx_automation_logs_executed_at ON automation_logs(executed_at);

-- Enable Row Level Security
ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE automation_logs ENABLE ROW LEVEL SECURITY;

-- Automation rules policies
CREATE POLICY "Users can view own automation rules"
  ON automation_rules FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own automation rules"
  ON automation_rules FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own automation rules"
  ON automation_rules FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own automation rules"
  ON automation_rules FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Automation logs policies
CREATE POLICY "Users can view own automation logs"
  ON automation_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own automation logs"
  ON automation_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_automation_rules_updated_at BEFORE UPDATE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to execute automation rules on transaction creation
CREATE OR REPLACE FUNCTION public.process_transaction_automation()
RETURNS TRIGGER AS $$
DECLARE
  rule RECORD;
  condition_met boolean;
  merchant_pattern text;
  amount_threshold decimal;
  target_category_id uuid;
BEGIN
  -- Loop through active automation rules for this user
  FOR rule IN 
    SELECT * FROM automation_rules 
    WHERE user_id = NEW.user_id 
    AND is_active = true 
    AND trigger_type IN ('transaction_created', 'transaction_amount', 'income_received')
  LOOP
    condition_met := false;
    
    -- Check trigger conditions
    CASE rule.trigger_type
      WHEN 'transaction_created' THEN
        -- Check if description matches pattern
        merchant_pattern := rule.trigger_conditions->>'merchant_pattern';
        IF merchant_pattern IS NOT NULL AND NEW.description ILIKE '%' || merchant_pattern || '%' THEN
          condition_met := true;
        END IF;
        
      WHEN 'transaction_amount' THEN
        amount_threshold := (rule.trigger_conditions->>'amount_threshold')::decimal;
        IF NEW.amount >= amount_threshold THEN
          condition_met := true;
        END IF;
        
      WHEN 'income_received' THEN
        IF NEW.type = 'income' THEN
          condition_met := true;
        END IF;
    END CASE;
    
    -- Execute action if condition is met
    IF condition_met THEN
      CASE rule.action_type
        WHEN 'categorize' THEN
          target_category_id := (rule.action_params->>'category_id')::uuid;
          IF target_category_id IS NOT NULL AND NEW.category_id IS NULL THEN
            NEW.category_id := target_category_id;
            
            -- Log the action
            INSERT INTO automation_logs (user_id, rule_id, trigger_data, action_taken, success)
            VALUES (
              NEW.user_id,
              rule.id,
              jsonb_build_object('transaction_id', NEW.id, 'description', NEW.description),
              'Auto-categorized transaction',
              true
            );
          END IF;
          
        WHEN 'move_to_savings' THEN
          -- This would be handled post-transaction
          NULL;
      END CASE;
      
      -- Update execution count
      UPDATE automation_rules 
      SET execution_count = execution_count + 1, 
          last_executed_at = now() 
      WHERE id = rule.id;
    END IF;
  END LOOP;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to run automation on new transactions
CREATE TRIGGER transaction_automation_trigger
  BEFORE INSERT ON transactions
  FOR EACH ROW
  EXECUTE FUNCTION process_transaction_automation();