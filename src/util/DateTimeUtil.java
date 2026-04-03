package util;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;

public final class DateTimeUtil {
    private static final DateTimeFormatter DATE_FORMATTER = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter TIME_FORMATTER = DateTimeFormatter.ofPattern("HH:mm:ss");

    private DateTimeUtil() {
    }

    public static String currentDateString() {
        return LocalDate.now().format(DATE_FORMATTER);
    }

    public static String currentTimeString() {
        return LocalTime.now().withNano(0).format(TIME_FORMATTER);
    }

    public static LocalDate currentDate() {
        return LocalDate.now();
    }

    public static LocalDate parseDate(String dateText) {
        return LocalDate.parse(dateText, DATE_FORMATTER);
    }

    public static String formatDate(LocalDate date) {
        return date.format(DATE_FORMATTER);
    }

    public static LocalDate startOfWeek(LocalDate anchorDate) {
        return anchorDate.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    public static LocalDate endOfWeek(LocalDate anchorDate) {
        return anchorDate.with(TemporalAdjusters.nextOrSame(DayOfWeek.SUNDAY));
    }

    public static boolean isWithinRange(String dateText, LocalDate startDate, LocalDate endDate) {
        LocalDate date = parseDate(dateText);
        return !date.isBefore(startDate) && !date.isAfter(endDate);
    }
}

