import clickhouse_driver
from datetime import datetime, timedelta
import random
import uuid

# Connect to Clickhouse
client = clickhouse_driver.Client(
    host='localhost',
    port=9001,
    user='statspeak_user',
    password='statspeak_password',
    database='statspeak'
)

# Generate sample invoices
def generate_invoices(num_customers=100, num_invoices_per_customer=10):
    """Generate sample invoice data."""
    
    invoices = []
    customer_ids = [f"CUST_{str(i).zfill(5)}" for i in range(1, num_customers + 1)]
    
    for customer_id in customer_ids:
        for _ in range(random.randint(1, num_invoices_per_customer)):
            invoice_date = datetime.now() - timedelta(days=random.randint(0, 365))
            total_amount = random.uniform(1000, 50000)
            
            invoices.append((
                str(uuid.uuid4()),
                customer_id,
                invoice_date.date(),
                total_amount,
                total_amount / random.randint(1, 5),
                f"PROD_{random.randint(1, 50)}",
                random.randint(1, 10)
            ))
    
    return invoices

# Generate sample contacts
def generate_contacts(num_customers=100):
    """Generate sample contact data."""
    
    contacts = []
    countries = ['Kenya', 'Uganda', 'Tanzania', 'Rwanda', 'Burundi']
    
    for i in range(1, num_customers + 1):
        contacts.append((
            f"CUST_{str(i).zfill(5)}",
            f"Customer {i}",
            f"customer{i}@example.com",
            f"+254{random.randint(100000000, 999999999)}",
            random.choice(countries),
            (datetime.now() - timedelta(days=random.randint(0, 730))).date()
        ))
    
    return contacts

# Insert data
print("Generating sample data...")
invoices = generate_invoices(num_customers=100, num_invoices_per_customer=15)
contacts = generate_contacts(num_customers=100)

print(f"Inserting {len(invoices)} invoices...")
client.execute(
    'INSERT INTO invoices (invoice_id, customer_id, invoice_date, total_amount, line_total, product_id, quantity) VALUES',
    invoices
)

print(f"Inserting {len(contacts)} contacts...")
client.execute(
    'INSERT INTO contacts (customer_id, customer_name, email, phone, country, created_date) VALUES',
    contacts
)

print("SUCCESS: Sample data inserted successfully!")

# Verify
result = client.execute("SELECT COUNT(*) FROM invoices")
print(f"Total invoices: {result[0][0]}")

result = client.execute("SELECT COUNT(*) FROM contacts")
print(f"Total contacts: {result[0][0]}")