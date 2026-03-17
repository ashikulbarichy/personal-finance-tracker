# Demo Account Instructions

## Creating a Demo Account with Seed Data

To explore the application with pre-populated sample data, follow these steps:

### Step 1: Create a Demo User

You can create a demo account in one of two ways:

**Option A: Through the UI**
1. Click "Sign up" on the login page
2. Use these credentials:
   - Email: `demo@financetracker.com`
   - Password: `demo123456`
   - Full Name: `Demo User`
3. Complete the registration

**Option B: Through Supabase Dashboard**
1. Go to your Supabase project dashboard
2. Navigate to Authentication > Users
3. Click "Invite user" or "Add user"
4. Create a user with email `demo@financetracker.com`
5. Set a password (e.g., `demo123456`)

### Step 2: Populate with Seed Data

After creating the demo user, you need to populate their account with sample data.

1. Go to your Supabase project dashboard
2. Navigate to the SQL Editor
3. Get the user ID:
   ```sql
   SELECT id FROM auth.users WHERE email = 'demo@financetracker.com';
   ```
4. Run the seed data function with the user ID:
   ```sql
   SELECT create_demo_data('your-user-id-here');
   ```

Replace `'your-user-id-here'` with the actual UUID from step 3.

### What Sample Data is Included?

The demo account will be populated with:

#### Accounts
- **Main Checking**: $5,420.50
- **Emergency Savings**: $12,000.00
- **Chase Credit Card**: -$850.25
- **Cash Wallet**: $180.00

#### Transactions
- 3 months of transaction history
- Mix of income and expenses
- Various categories (groceries, dining, utilities, etc.)
- Realistic amounts and dates

#### Budgets
- Monthly Groceries: $600
- Dining Out Budget: $300
- Transportation: $200
- Entertainment Fund: $250

#### Recurring Transactions
- Netflix Subscription: $15.99/month
- Spotify Premium: $10.99/month
- Internet Bill: $79.99/month
- Phone Bill: $55.00/month
- Monthly Salary: $4,500/month

#### Savings Goals
- Emergency Fund: $12,000/$15,000 (80% complete)
- Vacation to Europe: $1,200/$5,000 (24% complete)
- New Laptop: $800/$2,000 (40% complete)

#### Loans
- Student Loan: $18,500 remaining (borrowing)
- Loan to Friend: $650 remaining (lending)

#### Categories
All default expense and income categories are automatically created

## Login Credentials

Once created, use these credentials to log in:
- **Email**: demo@financetracker.com
- **Password**: demo123456

## Features to Explore

1. **Dashboard** - View financial overview and recent transactions
2. **Accounts** - Manage different account types
3. **Transactions** - Browse 3 months of sample transactions
4. **Budgets** - See budget progress and spending limits
5. **Recurring Transactions** - View subscriptions and regular bills
6. **Savings Goals** - Track progress toward financial goals
7. **Loans** - Manage borrowing and lending
8. **Categories** - Organize transactions with categories
9. **Automation** - Create rules to automate financial tasks
10. **Reports** - Analyze spending patterns and trends
11. **Export** - Download financial data in CSV or JSON format

## Automation Rules Examples

Once logged in, try creating automation rules like:

1. **Auto-categorize Amazon purchases**
   - Trigger: Transaction created with "Amazon" in description
   - Action: Categorize as "Shopping"

2. **Save 10% of income**
   - Trigger: Income received
   - Action: Move 10% to savings

3. **Alert on large transactions**
   - Trigger: Transaction amount >= $500
   - Action: Send notification

## Notes

- The demo data is for exploration purposes only
- All monetary values are in USD
- Dates are relative to the current date (last 3 months)
- You can modify or delete any of the sample data
- Create new data to fully test all features
