package com.finnova.bank.auth.validation;

import java.nio.charset.StandardCharsets;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

public class StrongPasswordValidator implements ConstraintValidator<StrongPassword, String> {
    @Override
    public boolean isValid(String value, ConstraintValidatorContext context) { return accepts(value); }
    public static boolean accepts(String value) {
        return value != null && value.length() >= 12 && value.getBytes(StandardCharsets.UTF_8).length <= 72
                && value.chars().noneMatch(c -> Character.isWhitespace(c) || Character.isISOControl(c))
                && value.chars().anyMatch(Character::isUpperCase)
                && value.chars().anyMatch(Character::isLowerCase)
                && value.chars().anyMatch(Character::isDigit)
                && value.chars().anyMatch(c -> !Character.isLetterOrDigit(c));
    }
}
