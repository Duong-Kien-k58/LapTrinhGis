import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.geotools.factory.CommonFactoryFinder;
import org.geotools.styling.NamedLayer;
import org.geotools.styling.Style;
import org.geotools.styling.StyleFactory;
import org.geotools.styling.StyledLayerDescriptor;
import org.geotools.styling.css.CssParser;
import org.geotools.styling.css.CssTranslator;
import org.geotools.styling.css.Stylesheet;
import org.geotools.xml.styling.SLDTransformer;

/** Compile GeoServer CSS locally, without connecting to a GeoServer catalog. */
public class CompileStyles {
    public static void main(String[] args) throws Exception {
        Path folder = Paths.get(args[0]);
        List<Path> files = new ArrayList<Path>();
        java.nio.file.DirectoryStream<Path> stream = Files.newDirectoryStream(folder, "*.css");
        try { for (Path file : stream) files.add(file); } finally { stream.close(); }
        Collections.sort(files);
        Map<String, String> cache = new HashMap<String, String>();
        for (Path file : files) {
            try {
                String css = new String(Files.readAllBytes(file), StandardCharsets.UTF_8);
                String sld = (String) cache.get(css);
                if (sld == null) {
                    // Relative project images become runtime URLs after compilation.
                    String prepared = css.replaceAll("url\\(\\s*(['\"]?)assets/", "url($1http://style-assets.invalid/");
                    Stylesheet sheet = CssParser.parse(prepared);
                    Style style = (Style) new CssTranslator().translate(sheet);
                    style.setName("local-style");
                    style.setDefault(true);
                    StyleFactory factory = CommonFactoryFinder.getStyleFactory();
                    NamedLayer layer = factory.createNamedLayer();
                    layer.setName("{{layerName}}");
                    layer.addStyle(style);
                    StyledLayerDescriptor descriptor = factory.createStyledLayerDescriptor();
                    descriptor.addStyledLayer(layer);
                    SLDTransformer transformer = new SLDTransformer();
                    transformer.setIndentation(2);
                    sld = transformer.transform(descriptor).replace("http://style-assets.invalid", "{{assetBaseUrl}}");
                    cache.put(css, sld);
                }
                System.out.println(file.getFileName().toString() + "\t" + Base64.getEncoder().encodeToString(sld.getBytes(StandardCharsets.UTF_8)));
            } catch (Exception error) {
                throw new IllegalArgumentException("Invalid CSS in " + file.getFileName().toString() + ": " + error.getMessage(), error);
            }
        }
    }
}
