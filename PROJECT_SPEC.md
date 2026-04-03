# BENJOJI Payment Handling & Inventory System

Consolidated project brief assembled from Step 1 through Step 7.

## Step 1 - Product Vision

`BENJOJI Payment Handling & Inventory System` is a business management solution for:

- multi-method payments
- invoice generation
- receipt generation
- stock management
- sales tracking
- credit transactions
- accounting visibility

The system is intended for retail shops, supermarkets, restaurants, salons, cyber cafes, pharmacies, kiosks, service businesses, and other small to medium businesses.

Primary supported payment channels:

- M-Pesa
- Buy Goods
- Paybill
- Airtel Money
- Cash
- Card
- Bank Transfer

Long-term roadmap ideas:

- cashier dashboard
- admin panel
- transaction history
- reports and analytics
- customer records
- refunds
- role-based access
- database integration
- mobile app
- web dashboard
- real M-Pesa API integration
- barcode scanning

## Step 2 - Core Features

### Invoice System

Invoices are generated before payment and include:

- business name
- customer name
- invoice number
- date and time
- products
- quantities
- unit prices
- subtotals
- total amount due

### Payment System

The system supports:

- single payment
- split payment
- full payment
- partial payment
- overpayment
- underpayment
- credit transactions

Electronic payments should simulate:

- amount prompt
- processing message
- waiting for confirmation
- confirmation success message

### Inventory, Sales, Credit, and Receipt Rules

- Products contain `productName`, `unitPrice`, and `stockQuantity`
- Stock-in and stock-out movements must record product, quantity, date, time, and action type
- Sales records capture products sold, customer, totals, methods used, status, date, and time
- Credit records track customer debt, linked transaction, owed amount, status, date, and time
- Receipts include payment breakdown, total paid, balance or change, and transaction status
- Validation prevents negative values, invalid quantities, unsupported payment methods, and insufficient stock

## Step 3 - System Flow

Main modules:

- Product / Inventory Module
- Sales / Invoice Module
- Payment Module
- Credit Module
- Receipt Module
- Transaction / Record Module
- Reports Module
- Accounting Module
- Authorization / Approval Module

Main menu:

```text
===== BENJOJI Payment Handling & Inventory System =====
1. Add Product / Stock In
2. View Products
3. Start New Sale
4. Process Customer Debt Payment
5. View Sales Records
6. View Credit Records
7. Generate Daily Sales Report
8. Generate Weekly Sales Report
9. View Accounting Summary
10. Exit
```

Key business rules:

- every stock movement records date and time
- every sale records date and time
- stock reduces only after sale finalization
- credit requires customer identification
- reports include `Prepared By`, `Authorized By`, and a signature placeholder

## Step 4 - System Architecture

### Model Layer

- `Product`
- `Customer`
- `SaleItem`
- `Invoice`
- `Payment`
- `Transaction`
- `Receipt`
- `CreditRecord`
- `StockRecord`
- `SalesRecord`
- `Report`

### Service Layer

- `InventoryService`
- `SalesService`
- `PaymentService`
- `CreditService`
- `ReceiptService`
- `ReportService`
- `AccountingService`
- `AuthorizationService`

### Utility Layer

- `IDGenerator`
- `DateTimeUtil`
- `InputValidator`
- `Formatter`

### Application Layer

- `Main`
- `MenuHandler`

Recommended project structure:

```text
src/
|-- Main.java
|-- MenuHandler.java
|-- model/
|-- service/
`-- util/
```

## Step 5 - Data Design

Core relationships:

- `Product -> SaleItem`
- `Invoice -> SaleItem`
- `Transaction -> Invoice`
- `Transaction -> Payment`
- `Transaction -> Receipt`
- `Transaction -> CreditRecord`
- `Transaction -> SalesRecord`
- `Transaction -> StockRecord`
- `Report -> SalesRecord / CreditRecord / StockRecord`

Main tracked fields:

- product identity, price, and stock
- customer identity and outstanding debt
- invoice totals and timestamps
- payment method, amount, and confirmation status
- transaction totals, balance, change, and status
- receipt payment breakdown and final status
- credit amount owed and repayment state
- stock movement authorization and references
- sales totals and payment summary
- report totals, breakdowns, and approvals

## Step 6 - Java Implementation Plan

Implementation goals:

- clean
- modular
- manageable
- testable
- easy to upgrade
- strong enough for GitHub later

Version 1 target scope:

- add product / stock in
- view products
- start new sale
- select products and quantities
- generate invoice
- process payment
- support multiple payment methods
- support split payments
- support confirmations
- handle exact / over / under payment
- record credit if unpaid
- reduce stock after sale
- generate receipt
- save sales records
- save credit records
- generate daily report
- generate weekly report
- show accounting summary

Version 1 storage approach:

- in-memory `ArrayList<Product>`
- in-memory `ArrayList<SalesRecord>`
- in-memory `ArrayList<CreditRecord>`
- in-memory `ArrayList<StockRecord>`
- in-memory `ArrayList<Report>`

## Step 7 - Testing and Real-World Scenarios

Coverage areas:

- inventory
- invoices
- payments
- credit
- stock updates
- receipts
- reports
- accounting summaries

Representative test scenarios:

- add a new product and verify stock-in record creation
- stock in an existing product and verify updated quantity
- reject invalid stock or payment input
- generate invoices with one or many products
- reject nonexistent or insufficient-stock sales
- verify exact payment, overpayment, underpayment, and split payment
- verify mobile-money confirmation flow
- verify full credit and partial credit sales
- process later debt payment and update remaining debt
- confirm stock-out happens only after completed sale finalization
- generate daily and weekly summaries
- verify accounting totals by payment method

Acceptance scenarios:

- normal paid sale
- split payment sale
- partial credit sale
- full credit sale
- daily closing review
- weekly management review

## Current Status

Completed design stages:

- Step 1 - Product Vision
- Step 2 - Core Features
- Step 3 - System Flow
- Step 4 - System Architecture
- Step 5 - Data Design
- Step 6 - Java Implementation Plan
- Step 7 - Testing and Real-World Scenarios
