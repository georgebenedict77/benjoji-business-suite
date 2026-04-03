import java.awt.GraphicsEnvironment;
import java.util.ArrayList;
import java.util.List;

import javax.swing.SwingUtilities;

import ui.DesktopAppController;
import ui.DesktopAppFrame;

public class Main {
    public static void main(String[] args) {
        boolean consoleMode = false;
        List<String> businessNameParts = new ArrayList<>();

        for (String arg : args) {
            if ("--console".equalsIgnoreCase(arg)) {
                consoleMode = true;
            } else {
                businessNameParts.add(arg);
            }
        }

        String businessName = businessNameParts.isEmpty() ? "BENJOJI Business" : String.join(" ", businessNameParts).trim();

        if (consoleMode || GraphicsEnvironment.isHeadless()) {
            new MenuHandler(businessName).run();
            return;
        }

        SwingUtilities.invokeLater(() -> {
            DesktopAppFrame.installLookAndFeel();
            new DesktopAppFrame(new DesktopAppController(businessName)).setVisible(true);
        });
    }
}
