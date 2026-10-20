package com.finnova.bank.common;

import java.io.IOException;
import java.time.Clock;
import java.time.Instant;
import java.util.List;

import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;

@Component
public class ApiErrorWriter {
    private final ObjectMapper mapper;
    private final Clock clock;
    public ApiErrorWriter(ObjectMapper mapper, Clock clock) { this.mapper = mapper; this.clock = clock; }
    public void write(HttpServletRequest request, HttpServletResponse response, HttpStatus status, String message) throws IOException {
        response.setStatus(status.value());
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding("UTF-8");
        response.setHeader("Cache-Control", "no-store");
        mapper.writeValue(response.getOutputStream(), new ApiError(Instant.now(clock), status.value(),
                status.getReasonPhrase(), message, request.getRequestURI(), List.of()));
    }
}
