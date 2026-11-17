// A Java window for the _XEMBED_INFO survey (task 61, fix 2): "swing" opens a JFrame with a text field, a button and
// a JDialog; "awt" opens a java.awt.Frame with a TextField, a Button and a Dialog.
import java.awt.*;
import javax.swing.*;

public class Survey {
    public static void main(String[] args) throws Exception {
        String title = "cua171-survey-java-" + args[0];
        if (args[0].equals("awt")) {
            Frame f = new Frame(title);
            f.setLayout(new FlowLayout());
            f.add(new TextField("cua171", 20));
            f.add(new Button("ok"));
            f.setSize(400, 200);
            f.setVisible(true);
            Dialog d = new Dialog(f, title + "-dialog", false);
            d.add(new Label("dialog"));
            d.setSize(200, 100);
            d.setVisible(true);
        } else {
            SwingUtilities.invokeAndWait(() -> {
                JFrame f = new JFrame(title);
                f.setLayout(new FlowLayout());
                f.add(new JTextField("cua171", 20));
                f.add(new JButton("ok"));
                f.setSize(400, 200);
                f.setVisible(true);
                JDialog d = new JDialog(f, title + "-dialog", false);
                d.add(new JLabel("dialog"));
                d.setSize(200, 100);
                d.setVisible(true);
            });
        }
    }
}
