package com.finnova.bank.common;

import java.time.Clock;
import java.time.Instant;
import java.util.Comparator;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.HttpStatusCode;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.ServletWebRequest;
import org.springframework.web.context.request.WebRequest;
import org.springframework.web.servlet.mvc.method.annotation.ResponseEntityExceptionHandler;

@RestControllerAdvice
public class GlobalExceptionHandler extends ResponseEntityExceptionHandler {
    private static final Logger LOG = LoggerFactory.getLogger(GlobalExceptionHandler.class);
    private final Clock clock;
    public GlobalExceptionHandler(Clock clock) { this.clock = clock; }

    @ExceptionHandler(ApiException.class)
    ResponseEntity<Object> business(ApiException ex, WebRequest request) {
        return error(ex.status(), ex.getMessage(), List.of(), new HttpHeaders(), request);
    }
    @ExceptionHandler(AccessDeniedException.class)
    ResponseEntity<Object> forbidden(AccessDeniedException ex, WebRequest request) {
        return error(HttpStatus.FORBIDDEN, "You do not have permission for this action.", List.of(), new HttpHeaders(), request);
    }
    @ExceptionHandler(AuthenticationException.class)
    ResponseEntity<Object> unauthenticated(AuthenticationException ex, WebRequest request) {
        return error(HttpStatus.UNAUTHORIZED, "Authentication is required or the session is no longer valid.", List.of(), new HttpHeaders(), request);
    }
    @ExceptionHandler(DataIntegrityViolationException.class)
    ResponseEntity<Object> integrity(DataIntegrityViolationException ex, WebRequest request) {
        return error(HttpStatus.CONFLICT, "The request conflicts with an existing record or an integrity rule.", List.of(), new HttpHeaders(), request);
    }
    @ExceptionHandler({CannotAcquireLockException.class, OptimisticLockingFailureException.class})
    ResponseEntity<Object> concurrentUpdate(Exception ex, WebRequest request) {
        return error(HttpStatus.CONFLICT, "The record changed or is busy. Retry the action.", List.of(), new HttpHeaders(), request);
    }
    @Override
    protected ResponseEntity<Object> handleMethodArgumentNotValid(MethodArgumentNotValidException ex,
            HttpHeaders headers, HttpStatusCode status, WebRequest request) {
        List<ApiError.FieldError> fields = ex.getBindingResult().getFieldErrors().stream()
                .map(field -> new ApiError.FieldError(field.getField(), field.getDefaultMessage()))
                .sorted(Comparator.comparing(ApiError.FieldError::field)).toList();
        return error(HttpStatus.BAD_REQUEST, "Request validation failed.", fields, headers, request);
    }
    @Override
    protected ResponseEntity<Object> handleExceptionInternal(Exception ex, Object body, HttpHeaders headers,
            HttpStatusCode status, WebRequest request) {
        String message = switch (status.value()) {
            case 400 -> "Malformed request or unsupported request fields.";
            case 404 -> "The requested resource was not found.";
            case 405 -> "This HTTP method is not supported for this resource.";
            case 415 -> "Use application/json for this request.";
            default -> "The request could not be processed.";
        };
        return error(HttpStatus.valueOf(status.value()), message, List.of(), headers, request);
    }
    @ExceptionHandler(Exception.class)
    ResponseEntity<Object> unexpected(Exception ex, WebRequest request) {
        // Never log request bodies, SQL, tokens, credentials, or exception messages.
        LOG.error("Unhandled API failure type={} chain={}", ex.getClass().getSimpleName(), chain(ex));
        return error(HttpStatus.INTERNAL_SERVER_ERROR, "An unexpected error occurred. Please try again later.",
                List.of(), new HttpHeaders(), request);
    }
    // Diagnostics only: class names plus SQLState and vendor code. Never messages, SQL or values.
    private static String chain(Throwable ex) {
        StringBuilder sb = new StringBuilder();
        Throwable t = ex;
        for (int depth = 0; t != null && depth < 8; depth++) {
            if (depth > 0) sb.append(" <- ");
            sb.append(t.getClass().getSimpleName());
            if (t instanceof java.sql.SQLException sql) {
                sb.append("[sqlState=").append(sql.getSQLState()).append(",code=").append(sql.getErrorCode()).append(']');
            }
            t = t.getCause() == t ? null : t.getCause();
        }
        return sb.toString();
    }

    private ResponseEntity<Object> error(HttpStatus status, String message, List<ApiError.FieldError> fields,
            HttpHeaders headers, WebRequest request) {
        String path = ((ServletWebRequest) request).getRequest().getRequestURI();
        ApiError error = new ApiError(Instant.now(clock), status.value(), status.getReasonPhrase(), message, path, fields);
        HttpHeaders safeHeaders = new HttpHeaders();
        safeHeaders.putAll(headers);
        safeHeaders.setCacheControl("no-store");
        return new ResponseEntity<>(error, safeHeaders, status);
    }
}
