package ui;

import java.awt.BorderLayout;
import java.awt.Color;
import java.awt.Dimension;
import java.awt.FlowLayout;
import java.awt.Font;
import java.awt.GridBagConstraints;
import java.awt.GridBagLayout;
import java.awt.GridLayout;
import java.awt.Insets;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import javax.swing.BorderFactory;
import javax.swing.Box;
import javax.swing.BoxLayout;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JComponent;
import javax.swing.JFrame;
import javax.swing.JLabel;
import javax.swing.JOptionPane;
import javax.swing.JPanel;
import javax.swing.JScrollPane;
import javax.swing.JSpinner;
import javax.swing.JSplitPane;
import javax.swing.JTabbedPane;
import javax.swing.JTable;
import javax.swing.JTextArea;
import javax.swing.JTextField;
import javax.swing.ListSelectionModel;
import javax.swing.SpinnerNumberModel;
import javax.swing.SwingConstants;
import javax.swing.UIManager;
import javax.swing.border.EmptyBorder;
import javax.swing.table.DefaultTableModel;

import model.CreditRecord;
import model.Product;
import model.SalesRecord;
import model.StockRecord;
import service.PaymentService.PaymentLedgerEntry;
import util.DateTimeUtil;
import util.Formatter;

public class DesktopAppFrame extends JFrame {
    private static final Color BACKGROUND = new Color(242, 246, 249);
    private static final Color SURFACE = Color.WHITE;
    private static final Color PRIMARY = new Color(17, 63, 103);
    private static final Color ACCENT = new Color(15, 134, 95);
    private static final Color TEXT_PRIMARY = new Color(27, 37, 45);

    private final DesktopAppController controller;

    private final JLabel productCountValue = createMetricValueLabel();
    private final JLabel stockMovementValue = createMetricValueLabel();
    private final JLabel salesCountValue = createMetricValueLabel();
    private final JLabel openDebtValue = createMetricValueLabel();
    private final JLabel totalSalesValue = createMetricValueLabel();
    private final JLabel totalCollectedValue = createMetricValueLabel();
    private final JLabel outstandingDebtValue = createMetricValueLabel();

    private final JTextField productNameField = new JTextField();
    private final JTextField unitPriceField = new JTextField();
    private final JTextField quantityField = new JTextField();
    private final JTextField authorizedByField = new JTextField();
    private final DefaultTableModel inventoryTableModel = createTableModel("Product ID", "Product", "Unit Price", "Stock");
    private final DefaultTableModel stockTableModel = createTableModel("Record ID", "Product", "Action", "Qty", "Date", "Time", "By");
    private final JTable inventoryTable = createTable(inventoryTableModel);
    private final JTable stockTable = createTable(stockTableModel);

    private final JTextField saleCustomerField = new JTextField();
    private final JTextField salePhoneField = new JTextField();
    private final JTextField saleProcessedByField = new JTextField();
    private final JComboBox<String> saleProductCombo = new JComboBox<>();
    private final JSpinner saleQuantitySpinner = new JSpinner(new SpinnerNumberModel(1, 1, 10_000, 1));
    private final JComboBox<String> salePaymentMethodCombo = new JComboBox<>();
    private final JTextField salePaymentAmountField = new JTextField();
    private final DefaultTableModel saleCartTableModel = createTableModel("Product", "Qty", "Unit Price", "Subtotal");
    private final DefaultTableModel salePaymentTableModel = createTableModel("Method", "Amount");
    private final JTable saleCartTable = createTable(saleCartTableModel);
    private final JTable salePaymentTable = createTable(salePaymentTableModel);
    private final JLabel saleTotalDueValue = createInlineValueLabel();
    private final JLabel saleTotalPaidValue = createInlineValueLabel();
    private final JLabel saleBalanceValue = createInlineValueLabel();
    private final JTextArea saleOutputArea = createOutputArea();
    private final List<SaleDraftLine> saleDraftLines = new ArrayList<>();
    private final List<PaymentDraftLine> saleDraftPayments = new ArrayList<>();

    private final JTextField debtCustomerField = new JTextField();
    private final JLabel selectedDebtValue = createInlineValueLabel();
    private final JComboBox<String> debtPaymentMethodCombo = new JComboBox<>();
    private final JTextField debtPaymentAmountField = new JTextField();
    private final DefaultTableModel debtTableModel = createTableModel("Customer", "Transaction", "Amount Owed", "Status", "Date");
    private final DefaultTableModel debtPaymentTableModel = createTableModel("Method", "Amount");
    private final JTable debtTable = createTable(debtTableModel);
    private final JTable debtPaymentTable = createTable(debtPaymentTableModel);
    private final JLabel debtDraftPaidValue = createInlineValueLabel();
    private final JLabel debtRemainingValue = createInlineValueLabel();
    private final JTextArea debtOutputArea = createOutputArea();
    private final List<PaymentDraftLine> debtDraftPayments = new ArrayList<>();

    private final DefaultTableModel salesRecordsTableModel = createTableModel("Transaction", "Customer", "Total", "Paid", "Balance",
            "Status", "Date");
    private final DefaultTableModel creditRecordsTableModel = createTableModel("Credit ID", "Customer", "Transaction", "Amount Owed",
            "Status", "Date");
    private final DefaultTableModel stockRecordsTableModel = createTableModel("Record ID", "Product", "Action", "Qty", "Date", "Time");
    private final DefaultTableModel paymentLedgerTableModel = createTableModel("Reference", "Customer", "Type", "Method", "Amount",
            "Date", "Time");
    private final JTable salesRecordsTable = createTable(salesRecordsTableModel);
    private final JTable creditRecordsTable = createTable(creditRecordsTableModel);
    private final JTable stockRecordsTable = createTable(stockRecordsTableModel);
    private final JTable paymentLedgerTable = createTable(paymentLedgerTableModel);

    private final JTextField reportDateField = new JTextField(DateTimeUtil.currentDateString());
    private final JTextField preparedByField = new JTextField();
    private final JTextField reportAuthorizedByField = new JTextField();
    private final JTextArea reportOutputArea = createOutputArea();

    public DesktopAppFrame(DesktopAppController controller) {
        this.controller = controller;
        configureFrame();
        setContentPane(createContent());
        refreshAllData();
    }

    public static void installLookAndFeel() {
        try {
            UIManager.setLookAndFeel(UIManager.getSystemLookAndFeelClassName());
        } catch (Exception ignored) {
        }
    }

    private void configureFrame() {
        setTitle(controller.getBusinessName() + " Desktop App");
        setDefaultCloseOperation(JFrame.EXIT_ON_CLOSE);
        setMinimumSize(new Dimension(1260, 820));
        setSize(1440, 920);
        setLocationRelativeTo(null);
    }

    private JComponent createContent() {
        JPanel root = new JPanel(new BorderLayout(16, 16));
        root.setBackground(BACKGROUND);
        root.setBorder(new EmptyBorder(16, 16, 16, 16));
        root.add(createHeader(), BorderLayout.NORTH);
        root.add(createTabs(), BorderLayout.CENTER);
        return root;
    }

    private JComponent createHeader() {
        JPanel header = new JPanel(new BorderLayout(12, 12));
        header.setBackground(PRIMARY);
        header.setBorder(new EmptyBorder(18, 20, 18, 20));

        JLabel title = new JLabel(controller.getBusinessName());
        title.setForeground(Color.WHITE);
        title.setFont(new Font("Segoe UI", Font.BOLD, 28));

        JLabel subtitle = new JLabel("Payment handling, inventory, credit, receipts, and reports in one desktop app");
        subtitle.setForeground(new Color(220, 232, 242));
        subtitle.setFont(new Font("Segoe UI", Font.PLAIN, 15));

        JPanel text = new JPanel();
        text.setOpaque(false);
        text.setLayout(new BoxLayout(text, BoxLayout.Y_AXIS));
        text.add(title);
        text.add(Box.createVerticalStrut(6));
        text.add(subtitle);

        JLabel badge = new JLabel("Desktop MVP", SwingConstants.CENTER);
        badge.setOpaque(true);
        badge.setBackground(new Color(255, 255, 255, 40));
        badge.setForeground(Color.WHITE);
        badge.setBorder(new EmptyBorder(8, 14, 8, 14));

        header.add(text, BorderLayout.WEST);
        header.add(badge, BorderLayout.EAST);
        return header;
    }

    private JComponent createTabs() {
        JTabbedPane tabs = new JTabbedPane();
        tabs.setFont(new Font("Segoe UI", Font.BOLD, 14));
        tabs.addTab("Dashboard", createDashboardTab());
        tabs.addTab("Inventory", createInventoryTab());
        tabs.addTab("New Sale", createSalesTab());
        tabs.addTab("Debt Payments", createDebtTab());
        tabs.addTab("Records", createRecordsTab());
        tabs.addTab("Reports", createReportsTab());
        return tabs;
    }

    private JPanel createSurfacePanel() {
        JPanel panel = new JPanel(new BorderLayout(12, 12));
        panel.setBackground(SURFACE);
        panel.setBorder(BorderFactory.createCompoundBorder(BorderFactory.createLineBorder(new Color(220, 228, 234)),
                new EmptyBorder(16, 16, 16, 16)));
        return panel;
    }

    private JTextArea createOutputArea() {
        JTextArea area = new JTextArea();
        area.setEditable(false);
        area.setLineWrap(true);
        area.setWrapStyleWord(true);
        area.setFont(new Font("Consolas", Font.PLAIN, 13));
        area.setBackground(new Color(248, 250, 252));
        area.setForeground(TEXT_PRIMARY);
        area.setBorder(new EmptyBorder(12, 12, 12, 12));
        return area;
    }

    private DefaultTableModel createTableModel(String... columns) {
        return new DefaultTableModel(columns, 0) {
            @Override
            public boolean isCellEditable(int row, int column) {
                return false;
            }
        };
    }

    private JTable createTable(DefaultTableModel model) {
        JTable table = new JTable(model);
        table.setRowHeight(26);
        table.setSelectionMode(ListSelectionModel.SINGLE_SELECTION);
        table.getTableHeader().setReorderingAllowed(false);
        return table;
    }

    private JLabel createMetricValueLabel() {
        JLabel label = new JLabel("--");
        label.setFont(new Font("Segoe UI", Font.BOLD, 24));
        label.setForeground(TEXT_PRIMARY);
        return label;
    }

    private JLabel createInlineValueLabel() {
        JLabel label = new JLabel("--");
        label.setFont(new Font("Segoe UI", Font.BOLD, 14));
        label.setForeground(TEXT_PRIMARY);
        return label;
    }

    private JComponent createDashboardTab() {
        JPanel container = new JPanel(new BorderLayout(16, 16));
        container.setOpaque(false);

        JPanel metrics = new JPanel(new GridLayout(2, 3, 16, 16));
        metrics.setOpaque(false);
        metrics.add(createMetricCard("Products", productCountValue, "Current items in inventory"));
        metrics.add(createMetricCard("Stock Movements", stockMovementValue, "Stock-in and stock-out records"));
        metrics.add(createMetricCard("Sales", salesCountValue, "Completed sales transactions"));
        metrics.add(createMetricCard("Open Debts", openDebtValue, "Customers with outstanding balances"));
        metrics.add(createMetricCard("Sales Value", totalSalesValue, "Total value sold"));
        metrics.add(createMetricCard("Collected", totalCollectedValue, "All money received so far"));

        JPanel lower = new JPanel(new GridLayout(1, 2, 16, 16));
        lower.setOpaque(false);
        lower.add(createMetricCard("Outstanding Debt", outstandingDebtValue, "Debt still to be collected"));

        JPanel gettingStarted = createSurfacePanel();
        gettingStarted.setLayout(new BoxLayout(gettingStarted, BoxLayout.Y_AXIS));
        JLabel heading = new JLabel("How to use this app");
        heading.setFont(new Font("Segoe UI", Font.BOLD, 18));
        heading.setForeground(TEXT_PRIMARY);
        gettingStarted.add(heading);
        gettingStarted.add(Box.createVerticalStrut(10));
        gettingStarted.add(createMutedLabel("1. Add products and stock in the Inventory tab."));
        gettingStarted.add(Box.createVerticalStrut(6));
        gettingStarted.add(createMutedLabel("2. Use New Sale to build a cart, add payments, and finalize receipts."));
        gettingStarted.add(Box.createVerticalStrut(6));
        gettingStarted.add(createMutedLabel("3. Use Debt Payments for later customer repayments."));
        gettingStarted.add(Box.createVerticalStrut(6));
        gettingStarted.add(createMutedLabel("4. Review Records and generate reports when needed."));
        lower.add(gettingStarted);

        container.add(metrics, BorderLayout.CENTER);
        container.add(lower, BorderLayout.SOUTH);
        return container;
    }

    private JPanel createMetricCard(String title, JLabel valueLabel, String subtitle) {
        JPanel card = createSurfacePanel();
        card.setLayout(new BoxLayout(card, BoxLayout.Y_AXIS));

        JLabel titleLabel = new JLabel(title);
        titleLabel.setFont(new Font("Segoe UI", Font.BOLD, 15));
        titleLabel.setForeground(new Color(88, 102, 114));

        JLabel subtitleLabel = new JLabel("<html><body style='width:220px'>" + subtitle + "</body></html>");
        subtitleLabel.setFont(new Font("Segoe UI", Font.PLAIN, 13));
        subtitleLabel.setForeground(new Color(115, 127, 136));

        card.add(titleLabel);
        card.add(Box.createVerticalStrut(12));
        card.add(valueLabel);
        card.add(Box.createVerticalStrut(8));
        card.add(subtitleLabel);
        return card;
    }

    private JLabel createMutedLabel(String text) {
        JLabel label = new JLabel(text);
        label.setFont(new Font("Segoe UI", Font.PLAIN, 14));
        label.setForeground(new Color(92, 106, 118));
        return label;
    }

    private JComponent createInventoryTab() {
        JPanel container = new JPanel(new BorderLayout(16, 16));
        container.setOpaque(false);

        JPanel formCard = createSurfacePanel();
        formCard.add(createInventoryForm(), BorderLayout.CENTER);

        JPanel inventoryCard = createSurfacePanel();
        inventoryCard.add(createSectionHeader("Products in Stock", "View and confirm current prices and quantities"), BorderLayout.NORTH);
        inventoryCard.add(new JScrollPane(inventoryTable), BorderLayout.CENTER);

        JPanel stockCard = createSurfacePanel();
        stockCard.add(createSectionHeader("Stock Activity", "Every stock in and stock out movement is tracked"), BorderLayout.NORTH);
        stockCard.add(new JScrollPane(stockTable), BorderLayout.CENTER);

        JSplitPane splitPane = new JSplitPane(JSplitPane.VERTICAL_SPLIT, inventoryCard, stockCard);
        splitPane.setOpaque(false);
        splitPane.setBorder(null);
        splitPane.setResizeWeight(0.58);

        container.add(formCard, BorderLayout.NORTH);
        container.add(splitPane, BorderLayout.CENTER);
        return container;
    }

    private JComponent createInventoryForm() {
        JPanel form = new JPanel(new GridBagLayout());
        form.setOpaque(false);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(6, 6, 6, 6);
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.weightx = 1;

        int row = 0;
        gbc.gridx = 0;
        gbc.gridy = row;
        form.add(createFieldLabel("Product Name"), gbc);
        gbc.gridx = 1;
        form.add(productNameField, gbc);
        gbc.gridx = 2;
        form.add(createFieldLabel("Unit Price"), gbc);
        gbc.gridx = 3;
        form.add(unitPriceField, gbc);

        row++;
        gbc.gridx = 0;
        gbc.gridy = row;
        form.add(createFieldLabel("Quantity"), gbc);
        gbc.gridx = 1;
        form.add(quantityField, gbc);
        gbc.gridx = 2;
        form.add(createFieldLabel("Authorized By"), gbc);
        gbc.gridx = 3;
        form.add(authorizedByField, gbc);

        JButton submitButton = createPrimaryButton("Save Product / Stock In");
        submitButton.addActionListener(event -> handleSaveInventory());

        row++;
        gbc.gridx = 0;
        gbc.gridy = row;
        gbc.gridwidth = 4;
        gbc.anchor = GridBagConstraints.WEST;
        form.add(submitButton, gbc);

        return form;
    }

    private JComponent createSectionHeader(String title, String subtitle) {
        JPanel header = new JPanel();
        header.setOpaque(false);
        header.setLayout(new BoxLayout(header, BoxLayout.Y_AXIS));
        JLabel titleLabel = new JLabel(title);
        titleLabel.setFont(new Font("Segoe UI", Font.BOLD, 18));
        titleLabel.setForeground(TEXT_PRIMARY);
        JLabel subtitleLabel = new JLabel(subtitle);
        subtitleLabel.setFont(new Font("Segoe UI", Font.PLAIN, 13));
        subtitleLabel.setForeground(new Color(111, 123, 133));
        header.add(titleLabel);
        header.add(Box.createVerticalStrut(4));
        header.add(subtitleLabel);
        return header;
    }

    private JLabel createFieldLabel(String text) {
        JLabel label = new JLabel(text);
        label.setFont(new Font("Segoe UI", Font.BOLD, 13));
        label.setForeground(TEXT_PRIMARY);
        return label;
    }

    private JButton createPrimaryButton(String text) {
        JButton button = new JButton(text);
        button.setBackground(ACCENT);
        button.setForeground(Color.WHITE);
        button.setFocusPainted(false);
        button.setBorder(new EmptyBorder(10, 16, 10, 16));
        return button;
    }

    private JButton createSecondaryButton(String text) {
        JButton button = new JButton(text);
        button.setFocusPainted(false);
        return button;
    }

    private void handleSaveInventory() {
        try {
            controller.addOrStockInProduct(productNameField.getText().trim(), parseAmount(unitPriceField.getText(), "Unit price"),
                    parseWholeNumber(quantityField.getText(), "Quantity"), authorizedByField.getText().trim());
            productNameField.setText("");
            unitPriceField.setText("");
            quantityField.setText("");
            authorizedByField.setText("");
            refreshAllData();
            showInfo("Inventory updated successfully.");
        } catch (IllegalArgumentException exception) {
            showError(exception.getMessage());
        }
    }

    private JComponent createSalesTab() {
        JPanel container = new JPanel(new BorderLayout(16, 16));
        container.setOpaque(false);

        JPanel left = new JPanel(new BorderLayout(16, 16));
        left.setOpaque(false);
        left.add(createSaleCustomerCard(), BorderLayout.NORTH);
        left.add(createSaleWorkspace(), BorderLayout.CENTER);

        JPanel right = createSurfacePanel();
        right.add(createSectionHeader("Invoice, Receipt, and Payment Flow", "This panel shows the current transaction output"),
                BorderLayout.NORTH);
        right.add(new JScrollPane(saleOutputArea), BorderLayout.CENTER);

        JSplitPane splitPane = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT, left, right);
        splitPane.setOpaque(false);
        splitPane.setBorder(null);
        splitPane.setResizeWeight(0.58);

        container.add(splitPane, BorderLayout.CENTER);
        return container;
    }

    private JComponent createSaleCustomerCard() {
        JPanel card = createSurfacePanel();
        JPanel form = new JPanel(new GridBagLayout());
        form.setOpaque(false);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(6, 6, 6, 6);
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.weightx = 1;

        gbc.gridx = 0;
        gbc.gridy = 0;
        form.add(createFieldLabel("Customer Name"), gbc);
        gbc.gridx = 1;
        form.add(saleCustomerField, gbc);
        gbc.gridx = 2;
        form.add(createFieldLabel("Phone Number"), gbc);
        gbc.gridx = 3;
        form.add(salePhoneField, gbc);

        gbc.gridx = 0;
        gbc.gridy = 1;
        form.add(createFieldLabel("Processed By"), gbc);
        gbc.gridx = 1;
        form.add(saleProcessedByField, gbc);

        card.add(createSectionHeader("Customer and Sale Details", "Walk-in customers are allowed for fully paid sales"), BorderLayout.NORTH);
        card.add(form, BorderLayout.CENTER);
        return card;
    }

    private JComponent createSaleWorkspace() {
        JPanel workspace = new JPanel(new GridLayout(1, 2, 16, 16));
        workspace.setOpaque(false);
        workspace.add(createSaleCartCard());
        workspace.add(createSalePaymentCard());
        return workspace;
    }

    private JComponent createSaleCartCard() {
        JPanel card = createSurfacePanel();
        card.add(createSectionHeader("Cart Builder", "Add products and quantities before finalizing the sale"), BorderLayout.NORTH);

        JPanel content = new JPanel(new BorderLayout(12, 12));
        content.setOpaque(false);

        JPanel top = new JPanel(new GridBagLayout());
        top.setOpaque(false);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(6, 6, 6, 6);
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.weightx = 1;

        gbc.gridx = 0;
        gbc.gridy = 0;
        top.add(createFieldLabel("Product"), gbc);
        gbc.gridx = 1;
        top.add(saleProductCombo, gbc);
        gbc.gridx = 2;
        top.add(createFieldLabel("Quantity"), gbc);
        gbc.gridx = 3;
        top.add(saleQuantitySpinner, gbc);

        JButton addButton = createPrimaryButton("Add Item");
        addButton.addActionListener(event -> handleAddSaleItem());
        JButton removeButton = createSecondaryButton("Remove Selected");
        removeButton.addActionListener(event -> handleRemoveSaleItem());

        JPanel buttonRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        buttonRow.setOpaque(false);
        buttonRow.add(addButton);
        buttonRow.add(removeButton);

        JPanel topWrap = new JPanel();
        topWrap.setOpaque(false);
        topWrap.setLayout(new BoxLayout(topWrap, BoxLayout.Y_AXIS));
        topWrap.add(top);
        topWrap.add(buttonRow);

        content.add(topWrap, BorderLayout.NORTH);
        content.add(new JScrollPane(saleCartTable), BorderLayout.CENTER);

        JPanel totals = new JPanel(new GridLayout(3, 2, 8, 8));
        totals.setOpaque(false);
        totals.add(createFieldLabel("Total Due"));
        totals.add(saleTotalDueValue);
        totals.add(createFieldLabel("Total Paid"));
        totals.add(saleTotalPaidValue);
        totals.add(createFieldLabel("Balance / Change"));
        totals.add(saleBalanceValue);
        content.add(totals, BorderLayout.SOUTH);

        card.add(content, BorderLayout.CENTER);
        return card;
    }

    private JComponent createSalePaymentCard() {
        JPanel card = createSurfacePanel();
        card.add(createSectionHeader("Payment Builder", "Support split payments, full payments, or credit"), BorderLayout.NORTH);

        JPanel content = new JPanel(new BorderLayout(12, 12));
        content.setOpaque(false);

        JPanel top = new JPanel(new GridBagLayout());
        top.setOpaque(false);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(6, 6, 6, 6);
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.weightx = 1;

        gbc.gridx = 0;
        gbc.gridy = 0;
        top.add(createFieldLabel("Payment Method"), gbc);
        gbc.gridx = 1;
        top.add(salePaymentMethodCombo, gbc);
        gbc.gridx = 2;
        top.add(createFieldLabel("Amount"), gbc);
        gbc.gridx = 3;
        top.add(salePaymentAmountField, gbc);

        JButton addPaymentButton = createPrimaryButton("Add Payment");
        addPaymentButton.addActionListener(event -> handleAddSalePayment());
        JButton removePaymentButton = createSecondaryButton("Remove Selected");
        removePaymentButton.addActionListener(event -> handleRemoveSalePayment());
        JButton clearSaleButton = createSecondaryButton("Clear Draft");
        clearSaleButton.addActionListener(event -> clearSaleDraft());
        JButton finalizeButton = createPrimaryButton("Finalize Sale");
        finalizeButton.addActionListener(event -> handleFinalizeSale());

        JPanel buttonRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        buttonRow.setOpaque(false);
        buttonRow.add(addPaymentButton);
        buttonRow.add(removePaymentButton);
        buttonRow.add(clearSaleButton);
        buttonRow.add(finalizeButton);

        JPanel topWrap = new JPanel();
        topWrap.setOpaque(false);
        topWrap.setLayout(new BoxLayout(topWrap, BoxLayout.Y_AXIS));
        topWrap.add(top);
        topWrap.add(buttonRow);

        content.add(topWrap, BorderLayout.NORTH);
        content.add(new JScrollPane(salePaymentTable), BorderLayout.CENTER);

        card.add(content, BorderLayout.CENTER);
        return card;
    }

    private void handleAddSaleItem() {
        String productName = (String) saleProductCombo.getSelectedItem();
        if (productName == null || productName.isBlank()) {
            showError("Add inventory first, then choose a product.");
            return;
        }

        int quantity = ((Number) saleQuantitySpinner.getValue()).intValue();
        Product product = controller.getProducts().stream().filter(item -> item.getProductName().equalsIgnoreCase(productName)).findFirst()
                .orElse(null);
        if (product == null) {
            showError("Selected product was not found.");
            return;
        }

        int mergedIndex = -1;
        for (int index = 0; index < saleDraftLines.size(); index++) {
            if (saleDraftLines.get(index).productName().equalsIgnoreCase(productName)) {
                mergedIndex = index;
                break;
            }
        }

        if (mergedIndex >= 0) {
            SaleDraftLine current = saleDraftLines.get(mergedIndex);
            saleDraftLines.set(mergedIndex, new SaleDraftLine(current.productName(), current.quantity() + quantity, current.unitPrice()));
        } else {
            saleDraftLines.add(new SaleDraftLine(product.getProductName(), quantity, product.getUnitPrice()));
        }

        refreshSaleDraftDisplay();
    }

    private void handleRemoveSaleItem() {
        int selectedRow = findSelectedRowForModel(saleCartTableModel);
        if (selectedRow < 0) {
            showError("Select a cart row to remove.");
            return;
        }
        saleDraftLines.remove(selectedRow);
        refreshSaleDraftDisplay();
    }

    private void handleAddSalePayment() {
        try {
            String method = (String) salePaymentMethodCombo.getSelectedItem();
            saleDraftPayments.add(new PaymentDraftLine(method, parseAmount(salePaymentAmountField.getText(), "Payment amount")));
            salePaymentAmountField.setText("");
            refreshSaleDraftDisplay();
        } catch (IllegalArgumentException exception) {
            showError(exception.getMessage());
        }
    }

    private void handleRemoveSalePayment() {
        int selectedRow = findSelectedRowForModel(salePaymentTableModel);
        if (selectedRow < 0) {
            showError("Select a payment row to remove.");
            return;
        }
        saleDraftPayments.remove(selectedRow);
        refreshSaleDraftDisplay();
    }

    private void handleFinalizeSale() {
        try {
            List<DesktopAppController.SaleInput> saleInputs = saleDraftLines.stream()
                    .map(line -> new DesktopAppController.SaleInput(line.productName(), line.quantity())).toList();
            List<DesktopAppController.PaymentInput> paymentInputs = saleDraftPayments.stream()
                    .map(line -> new DesktopAppController.PaymentInput(line.paymentMethod(), line.amount())).toList();

            DesktopAppController.SaleResult result = controller.processSale(saleCustomerField.getText().trim(),
                    salePhoneField.getText().trim(), saleProcessedByField.getText().trim(), saleInputs, paymentInputs);
            saleOutputArea.setText(result.detailText());
            clearSaleDraft();
            refreshAllData();
            showInfo("Sale completed successfully.");
        } catch (IllegalArgumentException exception) {
            showError(exception.getMessage());
        }
    }

    private void clearSaleDraft() {
        saleDraftLines.clear();
        saleDraftPayments.clear();
        saleCustomerField.setText("");
        salePhoneField.setText("");
        saleProcessedByField.setText("");
        salePaymentAmountField.setText("");
        refreshSaleDraftDisplay();
    }

    private JComponent createDebtTab() {
        JPanel container = new JPanel(new BorderLayout(16, 16));
        container.setOpaque(false);

        debtTable.getSelectionModel().addListSelectionListener(event -> {
            if (!event.getValueIsAdjusting()) {
                syncSelectedDebtCustomer(debtTable.getSelectedRow());
            }
        });

        JPanel left = createSurfacePanel();
        left.add(createSectionHeader("Outstanding Debts", "Select a customer debt, then build the repayment"), BorderLayout.NORTH);
        left.add(new JScrollPane(debtTable), BorderLayout.CENTER);
        left.add(createDebtPaymentBuilder(), BorderLayout.SOUTH);

        JPanel right = createSurfacePanel();
        right.add(createSectionHeader("Debt Payment Receipt", "Every later repayment is shown here"), BorderLayout.NORTH);
        right.add(new JScrollPane(debtOutputArea), BorderLayout.CENTER);

        JSplitPane splitPane = new JSplitPane(JSplitPane.HORIZONTAL_SPLIT, left, right);
        splitPane.setOpaque(false);
        splitPane.setBorder(null);
        splitPane.setResizeWeight(0.58);

        container.add(splitPane, BorderLayout.CENTER);
        return container;
    }

    private JComponent createDebtPaymentBuilder() {
        JPanel wrapper = new JPanel(new BorderLayout(12, 12));
        wrapper.setOpaque(false);
        wrapper.setBorder(new EmptyBorder(12, 0, 0, 0));

        JPanel form = new JPanel(new GridBagLayout());
        form.setOpaque(false);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(6, 6, 6, 6);
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.weightx = 1;

        gbc.gridx = 0;
        gbc.gridy = 0;
        form.add(createFieldLabel("Customer"), gbc);
        gbc.gridx = 1;
        debtCustomerField.setEditable(false);
        form.add(debtCustomerField, gbc);
        gbc.gridx = 2;
        form.add(createFieldLabel("Outstanding"), gbc);
        gbc.gridx = 3;
        form.add(selectedDebtValue, gbc);

        gbc.gridx = 0;
        gbc.gridy = 1;
        form.add(createFieldLabel("Payment Method"), gbc);
        gbc.gridx = 1;
        form.add(debtPaymentMethodCombo, gbc);
        gbc.gridx = 2;
        form.add(createFieldLabel("Amount"), gbc);
        gbc.gridx = 3;
        form.add(debtPaymentAmountField, gbc);

        JButton addButton = createPrimaryButton("Add Debt Payment");
        addButton.addActionListener(event -> handleAddDebtPayment());
        JButton removeButton = createSecondaryButton("Remove Selected");
        removeButton.addActionListener(event -> handleRemoveDebtPayment());
        JButton clearButton = createSecondaryButton("Clear Draft");
        clearButton.addActionListener(event -> clearDebtDraft());
        JButton processButton = createPrimaryButton("Process Debt Payment");
        processButton.addActionListener(event -> handleProcessDebtPayment());

        JPanel actionRow = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        actionRow.setOpaque(false);
        actionRow.add(addButton);
        actionRow.add(removeButton);
        actionRow.add(clearButton);
        actionRow.add(processButton);

        JPanel totals = new JPanel(new GridLayout(2, 2, 8, 8));
        totals.setOpaque(false);
        totals.add(createFieldLabel("Draft Paid"));
        totals.add(debtDraftPaidValue);
        totals.add(createFieldLabel("Remaining After Draft"));
        totals.add(debtRemainingValue);

        wrapper.add(form, BorderLayout.NORTH);
        wrapper.add(new JScrollPane(debtPaymentTable), BorderLayout.CENTER);

        JPanel south = new JPanel(new BorderLayout(8, 8));
        south.setOpaque(false);
        south.add(actionRow, BorderLayout.NORTH);
        south.add(totals, BorderLayout.SOUTH);
        wrapper.add(south, BorderLayout.SOUTH);

        return wrapper;
    }

    private void handleAddDebtPayment() {
        try {
            String method = (String) debtPaymentMethodCombo.getSelectedItem();
            debtDraftPayments.add(new PaymentDraftLine(method, parseAmount(debtPaymentAmountField.getText(), "Payment amount")));
            debtPaymentAmountField.setText("");
            refreshDebtDraftDisplay();
        } catch (IllegalArgumentException exception) {
            showError(exception.getMessage());
        }
    }

    private void handleRemoveDebtPayment() {
        int selectedRow = findSelectedRowForModel(debtPaymentTableModel);
        if (selectedRow < 0) {
            showError("Select a debt payment row to remove.");
            return;
        }
        debtDraftPayments.remove(selectedRow);
        refreshDebtDraftDisplay();
    }

    private void handleProcessDebtPayment() {
        try {
            String customerName = debtCustomerField.getText().trim();
            if (customerName.isBlank()) {
                throw new IllegalArgumentException("Select a customer debt first.");
            }

            List<DesktopAppController.PaymentInput> inputs = debtDraftPayments.stream()
                    .map(line -> new DesktopAppController.PaymentInput(line.paymentMethod(), line.amount())).toList();
            DesktopAppController.DebtPaymentResult result = controller.settleDebt(customerName, inputs);
            debtOutputArea.setText(result.detailText());
            clearDebtDraft();
            refreshAllData();
            showInfo("Debt payment processed successfully.");
        } catch (IllegalArgumentException exception) {
            showError(exception.getMessage());
        }
    }

    private void clearDebtDraft() {
        debtDraftPayments.clear();
        debtPaymentAmountField.setText("");
        refreshDebtDraftDisplay();
    }

    private JComponent createRecordsTab() {
        JTabbedPane tabs = new JTabbedPane();
        tabs.addTab("Sales Records", createRecordsCard("Completed Sales", salesRecordsTableModel));
        tabs.addTab("Credit Records", createRecordsCard("Credit Balances", creditRecordsTableModel));
        tabs.addTab("Stock Records", createRecordsCard("Stock Movement Log", stockRecordsTableModel));
        tabs.addTab("Payment Ledger", createRecordsCard("All Received Payments", paymentLedgerTableModel));

        JPanel wrapper = new JPanel(new BorderLayout());
        wrapper.setOpaque(false);
        wrapper.add(tabs, BorderLayout.CENTER);
        return wrapper;
    }

    private JComponent createRecordsCard(String title, DefaultTableModel model) {
        JPanel card = createSurfacePanel();
        card.add(createSectionHeader(title, "Records refresh automatically after every completed action"), BorderLayout.NORTH);
        card.add(new JScrollPane(tableForModel(model)), BorderLayout.CENTER);
        return card;
    }

    private JComponent createReportsTab() {
        JPanel container = new JPanel(new BorderLayout(16, 16));
        container.setOpaque(false);

        JPanel controls = createSurfacePanel();
        controls.add(createReportsControls(), BorderLayout.CENTER);

        JPanel output = createSurfacePanel();
        output.add(createSectionHeader("Report Output", "Generate daily, weekly, or accounting summaries here"), BorderLayout.NORTH);
        output.add(new JScrollPane(reportOutputArea), BorderLayout.CENTER);

        container.add(controls, BorderLayout.NORTH);
        container.add(output, BorderLayout.CENTER);
        return container;
    }

    private JComponent createReportsControls() {
        JPanel form = new JPanel(new GridBagLayout());
        form.setOpaque(false);
        GridBagConstraints gbc = new GridBagConstraints();
        gbc.insets = new Insets(6, 6, 6, 6);
        gbc.fill = GridBagConstraints.HORIZONTAL;
        gbc.weightx = 1;

        gbc.gridx = 0;
        gbc.gridy = 0;
        form.add(createFieldLabel("Date"), gbc);
        gbc.gridx = 1;
        form.add(reportDateField, gbc);
        gbc.gridx = 2;
        form.add(createFieldLabel("Prepared By"), gbc);
        gbc.gridx = 3;
        form.add(preparedByField, gbc);
        gbc.gridx = 4;
        form.add(createFieldLabel("Authorized By"), gbc);
        gbc.gridx = 5;
        form.add(reportAuthorizedByField, gbc);

        JButton dailyButton = createPrimaryButton("Generate Daily Report");
        dailyButton.addActionListener(event -> handleGenerateDailyReport());
        JButton weeklyButton = createSecondaryButton("Generate Weekly Report");
        weeklyButton.addActionListener(event -> handleGenerateWeeklyReport());
        JButton accountingButton = createSecondaryButton("Show Accounting Summary");
        accountingButton.addActionListener(event -> reportOutputArea.setText(controller.generateAccountingSummary()));

        gbc.gridx = 0;
        gbc.gridy = 1;
        gbc.gridwidth = 6;
        JPanel actions = new JPanel(new FlowLayout(FlowLayout.LEFT, 8, 0));
        actions.setOpaque(false);
        actions.add(dailyButton);
        actions.add(weeklyButton);
        actions.add(accountingButton);
        form.add(actions, gbc);

        return form;
    }

    private void handleGenerateDailyReport() {
        try {
            reportOutputArea.setText(controller.generateDailyReport(parseDateOrToday(reportDateField.getText()), preparedByField.getText().trim(),
                    reportAuthorizedByField.getText().trim()));
        } catch (IllegalArgumentException exception) {
            showError(exception.getMessage());
        }
    }

    private void handleGenerateWeeklyReport() {
        try {
            reportOutputArea.setText(controller.generateWeeklyReport(parseDateOrToday(reportDateField.getText()),
                    preparedByField.getText().trim(), reportAuthorizedByField.getText().trim()));
        } catch (IllegalArgumentException exception) {
            showError(exception.getMessage());
        }
    }

    private void refreshAllData() {
        refreshDashboard();
        refreshInventoryTables();
        refreshProductSelectors();
        refreshSaleDraftDisplay();
        refreshDebtTable();
        refreshDebtDraftDisplay();
        refreshRecordsTables();
    }

    private void refreshDashboard() {
        DesktopAppController.DashboardSummary summary = controller.getDashboardSummary();
        productCountValue.setText(String.valueOf(summary.productCount()));
        stockMovementValue.setText(String.valueOf(summary.stockMovementCount()));
        salesCountValue.setText(String.valueOf(summary.salesCount()));
        openDebtValue.setText(String.valueOf(summary.openDebtCount()));
        totalSalesValue.setText(Formatter.currency(summary.totalSalesValue()));
        totalCollectedValue.setText(Formatter.currency(summary.totalCollected()));
        outstandingDebtValue.setText(Formatter.currency(summary.outstandingDebt()));
    }

    private void refreshInventoryTables() {
        resetTable(inventoryTableModel);
        for (Product product : controller.getProducts()) {
            inventoryTableModel.addRow(new Object[] { product.getProductId(), product.getProductName(),
                    Formatter.currency(product.getUnitPrice()), product.getStockQuantity() });
        }

        resetTable(stockTableModel);
        for (StockRecord record : controller.getStockRecords()) {
            stockTableModel.addRow(new Object[] { record.getStockRecordId(), record.getProductName(), record.getActionType(),
                    record.getQuantityChanged(), record.getDate(), record.getTime(), record.getAuthorizedBy() });
        }
    }

    private void refreshProductSelectors() {
        String selectedProduct = (String) saleProductCombo.getSelectedItem();
        saleProductCombo.removeAllItems();
        for (Product product : controller.getProducts()) {
            saleProductCombo.addItem(product.getProductName());
        }
        if (selectedProduct != null) {
            saleProductCombo.setSelectedItem(selectedProduct);
        }

        fillPaymentMethodCombo(salePaymentMethodCombo);
        fillPaymentMethodCombo(debtPaymentMethodCombo);
    }

    private void fillPaymentMethodCombo(JComboBox<String> comboBox) {
        String previous = (String) comboBox.getSelectedItem();
        comboBox.removeAllItems();
        for (String method : controller.getSupportedPaymentMethods()) {
            comboBox.addItem(method);
        }
        if (previous != null) {
            comboBox.setSelectedItem(previous);
        }
    }

    private void refreshSaleDraftDisplay() {
        resetTable(saleCartTableModel);
        double totalDue = 0.0;
        for (SaleDraftLine line : saleDraftLines) {
            saleCartTableModel.addRow(new Object[] { line.productName(), line.quantity(), Formatter.currency(line.unitPrice()),
                    Formatter.currency(line.subtotal()) });
            totalDue += line.subtotal();
        }

        resetTable(salePaymentTableModel);
        double totalPaid = 0.0;
        for (PaymentDraftLine line : saleDraftPayments) {
            salePaymentTableModel.addRow(new Object[] { line.paymentMethod(), Formatter.currency(line.amount()) });
            totalPaid += line.amount();
        }

        saleTotalDueValue.setText(Formatter.currency(totalDue));
        saleTotalPaidValue.setText(Formatter.currency(totalPaid));

        double net = totalDue - totalPaid;
        saleBalanceValue.setText(net >= 0 ? Formatter.currency(net) : "Change " + Formatter.currency(Math.abs(net)));
    }

    private void refreshDebtTable() {
        resetTable(debtTableModel);
        for (CreditRecord record : controller.getOpenCreditRecords()) {
            debtTableModel.addRow(new Object[] { record.getCustomer().getCustomerName(), record.getTransactionId(),
                    Formatter.currency(record.getAmountOwed()), record.getStatus(), record.getDate() });
        }

        if (controller.getOpenCreditRecords().isEmpty()) {
            debtCustomerField.setText("");
            selectedDebtValue.setText(Formatter.currency(0));
        } else if (debtCustomerField.getText().isBlank()) {
            CreditRecord record = controller.getOpenCreditRecords().get(0);
            debtCustomerField.setText(record.getCustomer().getCustomerName());
            selectedDebtValue.setText(Formatter.currency(record.getAmountOwed()));
        } else {
            syncSelectedDebtCustomerByName(debtCustomerField.getText().trim());
        }
    }

    private void refreshDebtDraftDisplay() {
        resetTable(debtPaymentTableModel);
        double totalPaid = 0.0;
        for (PaymentDraftLine line : debtDraftPayments) {
            debtPaymentTableModel.addRow(new Object[] { line.paymentMethod(), Formatter.currency(line.amount()) });
            totalPaid += line.amount();
        }
        debtDraftPaidValue.setText(Formatter.currency(totalPaid));

        double selectedDebtAmount = parseCurrencyLabel(selectedDebtValue.getText());
        double remaining = Math.max(selectedDebtAmount - totalPaid, 0.0);
        debtRemainingValue.setText(Formatter.currency(remaining));
    }

    private void refreshRecordsTables() {
        resetTable(salesRecordsTableModel);
        for (SalesRecord record : controller.getSalesRecords()) {
            salesRecordsTableModel.addRow(new Object[] { record.getTransactionId(), record.getCustomerName(),
                    Formatter.currency(record.getTotalAmount()), Formatter.currency(record.getTotalPaid()),
                    Formatter.currency(record.getBalance()), record.getStatus(), record.getDate() });
        }

        resetTable(creditRecordsTableModel);
        for (CreditRecord record : controller.getCreditRecords()) {
            creditRecordsTableModel.addRow(new Object[] { record.getCreditId(), record.getCustomer().getCustomerName(),
                    record.getTransactionId(), Formatter.currency(record.getAmountOwed()), record.getStatus(), record.getDate() });
        }

        resetTable(stockRecordsTableModel);
        for (StockRecord record : controller.getStockRecords()) {
            stockRecordsTableModel.addRow(new Object[] { record.getStockRecordId(), record.getProductName(), record.getActionType(),
                    record.getQuantityChanged(), record.getDate(), record.getTime() });
        }

        resetTable(paymentLedgerTableModel);
        for (PaymentLedgerEntry entry : controller.getPaymentLedgerEntries()) {
            paymentLedgerTableModel.addRow(new Object[] { entry.getReferenceId(), entry.getCustomerName(), entry.getSourceType(),
                    entry.getPaymentMethod(), Formatter.currency(entry.getAmount()), entry.getDate(), entry.getTime() });
        }
    }

    private void resetTable(DefaultTableModel model) {
        model.setRowCount(0);
    }

    private void syncSelectedDebtCustomer(int selectedRow) {
        if (selectedRow < 0 || selectedRow >= controller.getOpenCreditRecords().size()) {
            return;
        }
        CreditRecord record = controller.getOpenCreditRecords().get(selectedRow);
        debtCustomerField.setText(record.getCustomer().getCustomerName());
        selectedDebtValue.setText(Formatter.currency(record.getAmountOwed()));
        refreshDebtDraftDisplay();
    }

    private void syncSelectedDebtCustomerByName(String customerName) {
        for (CreditRecord record : controller.getOpenCreditRecords()) {
            if (record.getCustomer().getCustomerName().equalsIgnoreCase(customerName)) {
                debtCustomerField.setText(record.getCustomer().getCustomerName());
                selectedDebtValue.setText(Formatter.currency(record.getAmountOwed()));
                refreshDebtDraftDisplay();
                return;
            }
        }
        selectedDebtValue.setText(Formatter.currency(0));
        refreshDebtDraftDisplay();
    }

    private int findSelectedRowForModel(DefaultTableModel model) {
        return tableForModel(model).getSelectedRow();
    }

    private JTable tableForModel(DefaultTableModel model) {
        if (model == inventoryTableModel) {
            return inventoryTable;
        }
        if (model == stockTableModel) {
            return stockTable;
        }
        if (model == saleCartTableModel) {
            return saleCartTable;
        }
        if (model == salePaymentTableModel) {
            return salePaymentTable;
        }
        if (model == debtTableModel) {
            return debtTable;
        }
        if (model == debtPaymentTableModel) {
            return debtPaymentTable;
        }
        if (model == salesRecordsTableModel) {
            return salesRecordsTable;
        }
        if (model == creditRecordsTableModel) {
            return creditRecordsTable;
        }
        if (model == stockRecordsTableModel) {
            return stockRecordsTable;
        }
        if (model == paymentLedgerTableModel) {
            return paymentLedgerTable;
        }
        throw new IllegalArgumentException("Unknown table model.");
    }

    private double parseAmount(String text, String fieldName) {
        try {
            double value = Double.parseDouble(text.trim());
            if (value <= 0) {
                throw new IllegalArgumentException(fieldName + " must be greater than zero.");
            }
            return value;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("Enter a valid value for " + fieldName + ".");
        }
    }

    private int parseWholeNumber(String text, String fieldName) {
        try {
            int value = Integer.parseInt(text.trim());
            if (value <= 0) {
                throw new IllegalArgumentException(fieldName + " must be greater than zero.");
            }
            return value;
        } catch (NumberFormatException exception) {
            throw new IllegalArgumentException("Enter a valid whole number for " + fieldName + ".");
        }
    }

    private LocalDate parseDateOrToday(String text) {
        if (text == null || text.isBlank()) {
            return DateTimeUtil.currentDate();
        }
        try {
            return DateTimeUtil.parseDate(text.trim());
        } catch (Exception exception) {
            throw new IllegalArgumentException("Use the yyyy-MM-dd date format.");
        }
    }

    private double parseCurrencyLabel(String text) {
        if (text == null || text.isBlank() || "--".equals(text)) {
            return 0.0;
        }
        return Double.parseDouble(text.replace("KES", "").replace(",", "").trim());
    }

    private void showError(String message) {
        JOptionPane.showMessageDialog(this, message, "BENJOJI App", JOptionPane.ERROR_MESSAGE);
    }

    private void showInfo(String message) {
        JOptionPane.showMessageDialog(this, message, "BENJOJI App", JOptionPane.INFORMATION_MESSAGE);
    }

    private record SaleDraftLine(String productName, int quantity, double unitPrice) {
        double subtotal() {
            return quantity * unitPrice;
        }
    }

    private record PaymentDraftLine(String paymentMethod, double amount) {
    }
}
