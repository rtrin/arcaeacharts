# Database Setup Guide

This guide explains how to set up your own database backend for a song chart browsing application. These instructions use Supabase as an example, but the concepts apply to other database solutions as well.

## 1. Set Up Your Database Service

1. Visit [supabase.com](https://supabase.com) and create a free account
2. Click **"New Project"** from your dashboard
3. Choose:
   - **Project Name**: Something relevant to your app
   - **Database Password**: Create a secure password (save this!)
   - **Region**: Choose the closest to your location
4. Click **"Create new project"** and wait 2-3 minutes for setup

## 2. Get Your API Credentials

1. In your project dashboard, go to **Settings** → **API**
2. Copy these two values (you'll need them later):
   - **Project URL**: Your unique project endpoint
   - **Anon public key**: The public API key for client-side access

## 3. Configure Environment Variables

1. In your project root directory, create a file named `.env.local`
2. Add your Supabase credentials:

```env
VITE_SUPABASE_URL=your_project_url_here
VITE_SUPABASE_ANON_KEY=your_anon_key_here
```

3. Replace the placeholder values with your actual credentials from Step 2
4. **Important**: Never commit this file to git (it's in .gitignore by default)

## 4. Design Your Database Schema

1. In your dashboard, click on **SQL Editor** in the left sidebar
2. Click **"New Query"** to create a new SQL query
3. Design a table structure that fits your data needs

**Example structure for a music/chart database:**
```sql
-- Create your main data table
CREATE TABLE IF NOT EXISTS your_table_name (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  -- Add columns based on your data structure
  -- Common fields might include: title, artist, difficulty, etc.
  created_at TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Create indexes for better performance
-- CREATE INDEX IF NOT EXISTS idx_your_table_field ON your_table_name(field_name);

-- Enable Row Level Security
ALTER TABLE your_table_name ENABLE ROW LEVEL SECURITY;

-- Create access policies as needed
CREATE POLICY "Enable read access" ON your_table_name
  FOR SELECT TO anon, authenticated
  USING (true);
```

4. Click **"Run"** to execute the SQL and create your table
5. Verify the table was created successfully

## 5. Populate Your Database

You have several options to add data to your database:

### Option A: Manual Entry (Recommended for testing)
1. Go to **Table Editor** → **your_table_name** in your dashboard
2. Click **"Insert"** → **"Insert row"**
3. Add a few test entries manually to verify everything works

### Option B: Bulk Import (For larger datasets)
If you have a dataset ready:
1. Export your data as CSV or JSON format
2. Use the **Table Editor** → **Import data** feature
3. Map the columns to match your table structure

### Option C: Programmatic Insert
Use your application code or scripts to populate the database through the API.

**Important**: Make sure you have the rights to use any data you import. Respect copyright and terms of service for any third-party content.

## 6. Test Your Setup

1. **Restart your development server**:
   ```bash
   npm run dev
   ```

2. **Open your app** at `http://localhost:5173`

3. **Verify the connection**:
   - You should see "Loading songs..." briefly
   - If you added test data, it should appear
   - Check browser console (F12) for any error messages

## Results

Your application is now connected to your database. The app will load data from your database and all filtering/search functionality should work as expected.

## Troubleshooting

### Common Issues:

**"Failed to load data"**
- Double-check your environment variables in `.env.local`
- Restart your dev server after adding environment variables
- Verify your database URL and API key are correct

**"Permission denied"**
- Make sure you set up Row Level Security policies correctly
- Check that your policies allow the appropriate access levels

**"No data showing"**
- Verify your table was created successfully
- Check that you have data in your table
- Ensure your application code matches your database schema

### Need Help?
- Check the [Supabase documentation](https://supabase.com/docs) for detailed guides
- Review your setup step-by-step to identify any missed steps
- Consider starting with a simple test setup before importing large datasets

## Optional Enhancements

Once your basic setup is working, you can:
- Set up automatic data backups
- Add user authentication for admin features
- Implement data caching for better performance
- Add more advanced search features 