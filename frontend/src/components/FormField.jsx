export default function FormField({
  id, label, type = "text", value, onChange, error, hint,
  autoComplete, required = true, ...inputProps
}) {
  const hintId = hint ? id + "-hint" : undefined;
  const errorId = error ? id + "-error" : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="mb-3">
      <label htmlFor={id} className="form-label">
        {label}{required ? <span className="text-danger" aria-hidden="true"> *</span> : null}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        className={"form-control" + (error ? " is-invalid" : "")}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        aria-required={required}
        aria-invalid={error ? "true" : "false"}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {hint && !error ? <div id={hintId} className="form-text">{hint}</div> : null}
      {error ? <div id={errorId} className="invalid-feedback d-block">{error}</div> : null}
    </div>
  );
}
