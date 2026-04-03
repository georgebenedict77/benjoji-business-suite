import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.Scanner;

import model.Customer;
import model.Invoice;
import model.Payment;
import model.Product;
import model.Receipt;
import model.SaleItem;
import model.Transaction;
import service.AccountingService;
import service.AuthorizationService;
import service.CreditService;
import service.InventoryService;
import service.PaymentService;
import service.ReceiptService;
import service.ReportService;
import service.SalesService;
import util.DateTimeUtil;
import util.Formatter;
import util.InputValidator;

public class MenuHandler {
    private final Scanner scanner = new Scanner(System.in);
    private final String businessName;
    private final InventoryService inventoryService = new InventoryService();
    private final SalesService salesService = new SalesService();
    private final PaymentService paymentService = new PaymentService();
    private final CreditService creditService = new CreditService();
    private final ReceiptService receiptService = new ReceiptService();
    private final ReportService reportService = new ReportService();
    private final AccountingService accountingService = new AccountingService();
    private final AuthorizationService authorizationService = new AuthorizationService();

    public MenuHandler(String businessName) {
        this.businessName = InputValidator.requireNonBlank(businessName, "Business name");
    }

    public void run() {
        boolean running = true;

        System.out.println(Formatter.line());
        System.out.println("Welcome to " + businessName + " Payment Handling & Inventory System");
        System.out.println(Formatter.line());

        while (running) {
            printMenu();
            int choice = readInt("Select option: ");

            try {
                switch (choice) {
                    case 1 -> handleAddProductOrStockIn();
                    case 2 -> handleViewProducts();
                    case 3 -> handleStartNewSale();
                    case 4 -> handleProcessDebtPayment();
                    case 5 -> handleViewSalesRecords();
                    case 6 -> handleViewCreditRecords();
                    case 7 -> handleGenerateDailyReport();
                    case 8 -> handleGenerateWeeklyReport();
                    case 9 -> handleViewAccountingSummary();
                    case 10 -> {
                        running = false;
                        System.out.println("Exiting system. Goodbye.");
                    }
                    default -> System.out.println("Choose a valid menu option.");
                }
            } catch (IllegalArgumentException exception) {
                System.out.println("Error: " + exception.getMessage());
            }
        }
    }

    private void printMenu() {
        System.out.println();
        System.out.println("===== BENJOJI Payment Handling & Inventory System =====");
        System.out.println("1. Add Product / Stock In");
        System.out.println("2. View Products");
        System.out.println("3. Start New Sale");
        System.out.println("4. Process Customer Debt Payment");
        System.out.println("5. View Sales Records");
        System.out.println("6. View Credit Records");
        System.out.println("7. Generate Daily Sales Report");
        System.out.println("8. Generate Weekly Sales Report");
        System.out.println("9. View Accounting Summary");
        System.out.println("10. Exit");
    }

    private void handleAddProductOrStockIn() {
        System.out.println();
        System.out.println("Add Product / Stock In");
        String productName = readNonBlank("Product name: ");
        double unitPrice = readPositiveDouble("Unit price: ");
        int quantity = readPositiveInt("Quantity to add: ");
        String authorizedBy = readLine("Authorized by (optional): ");

        Product product = inventoryService.addOrStockInProduct(productName, unitPrice, quantity, authorizedBy);
        System.out.println("Saved product " + product.getProductName() + " with stock " + product.getStockQuantity() + ".");
    }

    private void handleViewProducts() {
        System.out.println();
        System.out.println(inventoryService.getInventorySnapshot());
    }

    private void handleStartNewSale() {
        if (inventoryService.getProducts().isEmpty()) {
            System.out.println("Add products before starting a sale.");
            return;
        }

        System.out.println();
        System.out.println("Start New Sale");
        String customerName = readLine("Customer name (press Enter for walk-in): ");
        List<SaleItem> saleItems = collectSaleItems();

        if (saleItems.isEmpty()) {
            System.out.println("Sale cancelled because no items were selected.");
            return;
        }

        Invoice invoice = salesService.createInvoice(businessName, customerName, saleItems);
        printInvoice(invoice);

        List<Payment> payments = collectSalePayments(invoice.getTotalAmount());
        if (sumPayments(payments) + 0.0001 < invoice.getTotalAmount() && InputValidator.isBlank(customerName)) {
            customerName = readNonBlank("Credit requires a customer name. Enter customer name: ");
            invoice = salesService.createInvoice(businessName, customerName, saleItems);
            System.out.println("Invoice updated for " + invoice.getCustomerName() + ".");
        }

        Transaction transaction = paymentService.finalizeTransaction(invoice, payments);
        inventoryService.reduceStockForSale(invoice.getSaleItems(), "Sales Desk", transaction.getTransactionId());
        salesService.recordSale(transaction, paymentService.buildPaymentSummary(transaction.getPayments()));

        if (transaction.getBalanceRemaining() > 0.0001) {
            creditService.createCreditRecord(invoice.getCustomerName(), "", transaction.getTransactionId(),
                    transaction.getBalanceRemaining());
        }

        Receipt receipt = receiptService.generateSaleReceipt(businessName, transaction);
        System.out.println(receiptService.formatReceipt(receipt));
    }

    private void handleProcessDebtPayment() {
        if (creditService.getOpenCreditRecords().isEmpty()) {
            System.out.println("There are no outstanding customer debts to process.");
            return;
        }

        System.out.println();
        System.out.println(creditService.formatOpenCreditRecords());

        String customerName = readNonBlank("Customer name for debt payment: ");
        Customer customer = creditService.findCustomerByName(customerName)
                .orElseThrow(() -> new IllegalArgumentException("Customer debt record not found."));

        if (customer.getOutstandingDebt() <= 0.0001) {
            throw new IllegalArgumentException(customer.getCustomerName() + " has no outstanding debt.");
        }

        System.out.println("Outstanding debt: " + Formatter.currency(customer.getOutstandingDebt()));
        List<Payment> payments = collectDebtPayments(customer.getOutstandingDebt());
        if (payments.isEmpty()) {
            System.out.println("Debt payment cancelled.");
            return;
        }

        CreditService.DebtPaymentResult result = creditService.processDebtPayment(customer.getCustomerName(), sumPayments(payments));
        Receipt receipt = receiptService.generateDebtPaymentReceipt(businessName, result.getCustomer().getCustomerName(), payments,
                result.getAppliedAmount(), result.getRemainingDebt(), result.getChangeReturned());
        paymentService.recordDebtPayment(result.getCustomer().getCustomerName(), receipt.getTransactionId(), payments);
        System.out.println(receiptService.formatReceipt(receipt));
    }

    private void handleViewSalesRecords() {
        System.out.println();
        System.out.println(salesService.formatSalesRecords());
    }

    private void handleViewCreditRecords() {
        System.out.println();
        System.out.println(creditService.formatCreditRecords());
    }

    private void handleGenerateDailyReport() {
        LocalDate targetDate = readDateOrDefault("Report date (yyyy-MM-dd, Enter for today): ", DateTimeUtil.currentDate());
        String preparedBy = authorizationService.resolvePreparedBy(readLine("Prepared by (optional): "));
        String authorizedBy = authorizationService.resolveAuthorizedBy(readLine("Authorized by (optional): "));

        var report = reportService.generateDailySalesReport(businessName, targetDate, salesService.getSalesRecords(),
                creditService.getCreditRecords(), paymentService.getPaymentLedgerEntries(), preparedBy, authorizedBy,
                authorizationService.signaturePlaceholder());

        System.out.println();
        System.out.println(reportService.formatReport(report, targetDate, targetDate, inventoryService.getStockRecords()));
    }

    private void handleGenerateWeeklyReport() {
        LocalDate anchorDate = readDateOrDefault("Any date in the target week (yyyy-MM-dd, Enter for today): ",
                DateTimeUtil.currentDate());
        LocalDate startDate = DateTimeUtil.startOfWeek(anchorDate);
        LocalDate endDate = DateTimeUtil.endOfWeek(anchorDate);
        String preparedBy = authorizationService.resolvePreparedBy(readLine("Prepared by (optional): "));
        String authorizedBy = authorizationService.resolveAuthorizedBy(readLine("Authorized by (optional): "));

        var report = reportService.generateWeeklySalesReport(businessName, anchorDate, salesService.getSalesRecords(),
                creditService.getCreditRecords(), paymentService.getPaymentLedgerEntries(), preparedBy, authorizedBy,
                authorizationService.signaturePlaceholder());

        System.out.println();
        System.out.println(reportService.formatReport(report, startDate, endDate, inventoryService.getStockRecords()));
    }

    private void handleViewAccountingSummary() {
        System.out.println();
        System.out.println(accountingService.generateAccountingSummary(businessName, salesService.getSalesRecords(),
                creditService.getCreditRecords(), paymentService.getPaymentLedgerEntries()));
    }

    private List<SaleItem> collectSaleItems() {
        List<SaleItem> saleItems = new ArrayList<>();

        while (true) {
            System.out.println();
            System.out.println(inventoryService.getInventorySnapshot());
            String productName = readLine("Enter product name to add or type DONE to finish: ");
            if ("DONE".equalsIgnoreCase(productName)) {
                break;
            }

            Optional<Product> product = inventoryService.findProductByName(productName);
            if (product.isEmpty()) {
                System.out.println("Product not found.");
                continue;
            }

            int quantity = readPositiveInt("Quantity: ");
            SaleItem item = salesService.createSaleItem(product.get(), quantity);
            saleItems.add(item);
            System.out.println("Added " + item.getProduct().getProductName() + " x" + item.getQuantity() + " to invoice.");
        }

        return saleItems;
    }

    private List<Payment> collectSalePayments(double totalDue) {
        List<Payment> payments = new ArrayList<>();

        while (true) {
            double remaining = Math.max(totalDue - sumPayments(payments), 0.0);
            if (remaining <= 0.0001) {
                break;
            }

            System.out.println("Outstanding amount: " + Formatter.currency(remaining));
            String prompt = "Payment method [" + String.join(", ", paymentService.getSupportedPaymentMethods())
                    + "] or CREDIT to leave balance unpaid: ";
            String paymentMethod = readLine(prompt);

            if ("CREDIT".equalsIgnoreCase(paymentMethod)) {
                break;
            }

            if (!paymentService.isSupportedPaymentMethod(paymentMethod)) {
                System.out.println("Unsupported payment method.");
                continue;
            }

            double amount = readPositiveDouble("Amount: ");
            printPaymentProcessing(paymentMethod, amount);
            payments.add(paymentService.createPayment(paymentMethod, amount));
            System.out.println("Payment recorded.");

            if (sumPayments(payments) >= totalDue) {
                break;
            }

            if (!readYesNo("Add another payment method? (y/n): ")) {
                break;
            }
        }

        return payments;
    }

    private List<Payment> collectDebtPayments(double outstandingDebt) {
        List<Payment> payments = new ArrayList<>();

        while (true) {
            double remaining = Math.max(outstandingDebt - sumPayments(payments), 0.0);
            if (remaining <= 0.0001) {
                break;
            }

            System.out.println("Remaining debt to cover: " + Formatter.currency(remaining));
            String prompt = "Payment method [" + String.join(", ", paymentService.getSupportedPaymentMethods())
                    + "] or DONE to stop: ";
            String paymentMethod = readLine(prompt);

            if ("DONE".equalsIgnoreCase(paymentMethod)) {
                break;
            }

            if (!paymentService.isSupportedPaymentMethod(paymentMethod)) {
                System.out.println("Unsupported payment method.");
                continue;
            }

            double amount = readPositiveDouble("Amount: ");
            printPaymentProcessing(paymentMethod, amount);
            payments.add(paymentService.createPayment(paymentMethod, amount));
            System.out.println("Debt payment entry recorded.");

            if (sumPayments(payments) >= outstandingDebt) {
                break;
            }

            if (!readYesNo("Add another debt payment entry? (y/n): ")) {
                break;
            }
        }

        return payments;
    }

    private void printInvoice(Invoice invoice) {
        System.out.println();
        System.out.println(Formatter.line());
        System.out.println("INVOICE: " + invoice.getInvoiceNumber());
        System.out.println("Customer: " + invoice.getCustomerName());
        System.out.println("Date: " + invoice.getDate() + " " + invoice.getTime());
        System.out.println(Formatter.shortLine());
        for (SaleItem item : invoice.getSaleItems()) {
            System.out.println("- " + item.getProduct().getProductName() + " x" + item.getQuantity() + " = "
                    + Formatter.currency(item.getSubtotal()));
        }
        System.out.println(Formatter.shortLine());
        System.out.println("Total Due: " + Formatter.currency(invoice.getTotalAmount()));
        System.out.println(Formatter.line());
    }

    private int readInt(String prompt) {
        while (true) {
            String input = readLine(prompt);
            try {
                return Integer.parseInt(input);
            } catch (NumberFormatException exception) {
                System.out.println("Enter a valid whole number.");
            }
        }
    }

    private int readPositiveInt(String prompt) {
        while (true) {
            int value = readInt(prompt);
            if (value > 0) {
                return value;
            }
            System.out.println("Enter a number greater than zero.");
        }
    }

    private double readPositiveDouble(String prompt) {
        while (true) {
            String input = readLine(prompt);
            try {
                double value = Double.parseDouble(input);
                if (value > 0) {
                    return value;
                }
                System.out.println("Enter an amount greater than zero.");
            } catch (NumberFormatException exception) {
                System.out.println("Enter a valid amount.");
            }
        }
    }

    private String readLine(String prompt) {
        System.out.print(prompt);
        return scanner.nextLine().trim();
    }

    private String readNonBlank(String prompt) {
        while (true) {
            String value = readLine(prompt);
            if (!InputValidator.isBlank(value)) {
                return value;
            }
            System.out.println("This field cannot be empty.");
        }
    }

    private boolean readYesNo(String prompt) {
        while (true) {
            String value = readLine(prompt);
            if ("y".equalsIgnoreCase(value) || "yes".equalsIgnoreCase(value)) {
                return true;
            }
            if ("n".equalsIgnoreCase(value) || "no".equalsIgnoreCase(value)) {
                return false;
            }
            System.out.println("Type y or n.");
        }
    }

    private LocalDate readDateOrDefault(String prompt, LocalDate defaultDate) {
        while (true) {
            String value = readLine(prompt);
            if (InputValidator.isBlank(value)) {
                return defaultDate;
            }
            try {
                return DateTimeUtil.parseDate(value);
            } catch (Exception exception) {
                System.out.println("Use the yyyy-MM-dd format.");
            }
        }
    }

    private void printPaymentProcessing(String paymentMethod, double amount) {
        for (String message : paymentService.buildPaymentProcessingMessages(paymentMethod, amount)) {
            System.out.println(message);
        }
    }

    private double sumPayments(List<Payment> payments) {
        return payments.stream().mapToDouble(Payment::getAmount).sum();
    }
}
