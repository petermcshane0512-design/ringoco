# Skill: Supabase — BellAveGo DB Queries

Query and write to BellAveGo's Supabase instance.

## Connection
```
URL: process.env.NEXT_PUBLIC_SUPABASE_URL
Key: process.env.SUPABASE_SERVICE_ROLE_KEY (service role — bypasses RLS)
```

RLS is DISABLED on `profiles`. All other tables: use service role key to bypass.

## Core Tables

### profiles
Owner of a BellAveGo account (the contractor).
Key columns: `user_id`, `business_name`, `owner_phone`, `twilio_number`, `services`, `service_area`

### jobs
Every job request collected from a call.
Key columns: `user_id`, `customer_name`, `customer_phone`, `job_type`, `address`, `scheduled_time`, `status` (pending_approval | confirmed | declined)

### call_logs
Every call handled by the AI. Not yet fully implemented — schema to be added.
Target columns: `profile_id`, `call_sid`, `caller_phone`, `duration_seconds`, `transcript`, `booking_completed`, `created_at`

### invoices
Stripe payment links sent to customers.
Key columns: `user_id`, `customer_name`, `customer_phone`, `amount`, `stripe_payment_link`, `status` (pending | paid | overdue)

### customers
Customer records. Key columns: `user_id`, `name`, `phone`, `address`

## Common Queries

Get all jobs for a contractor:
```sql
SELECT * FROM jobs WHERE user_id = '{uid}' ORDER BY created_at DESC
```

Get revenue captured (sum of paid invoices):
```sql
SELECT SUM(amount) FROM invoices WHERE user_id = '{uid}' AND status = 'paid'
```

Get calls this month:
```sql
SELECT COUNT(*) FROM call_logs 
WHERE profile_id = '{uid}' 
AND created_at > date_trunc('month', now())
```

## Never
- Never query without `user_id` or `profile_id` filter — returns all customers' data
- Never expose service role key to client-side code
