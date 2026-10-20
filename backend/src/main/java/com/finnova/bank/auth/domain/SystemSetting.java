package com.finnova.bank.auth.domain;
import jakarta.persistence.*;
@Entity @Table(name = "system_settings")
public class SystemSetting {
    @Id @Column(name = "setting_key", length = 100) private String key;
    @Column(name = "setting_value", nullable = false, length = 500) private String value;
    protected SystemSetting() { }
    public String getValue() { return value; }
    public void setValue(String value) { this.value = value; }
}

