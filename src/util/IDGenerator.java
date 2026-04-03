package util;

import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicInteger;

public final class IDGenerator {
    private static final Map<String, AtomicInteger> COUNTERS = new ConcurrentHashMap<>();
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.BASIC_ISO_DATE;

    private IDGenerator() {
    }

    public static String generate(String prefix) {
        String safePrefix = prefix == null || prefix.isBlank() ? "ID" : prefix.trim().toUpperCase(Locale.US);
        int sequence = COUNTERS.computeIfAbsent(safePrefix, key -> new AtomicInteger()).incrementAndGet();
        return safePrefix + "-" + LocalDate.now().format(DATE_FORMATTER) + "-" + String.format(Locale.US, "%04d", sequence);
    }
}

