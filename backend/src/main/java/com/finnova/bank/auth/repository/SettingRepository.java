package com.finnova.bank.auth.repository;
import java.util.Optional;
import com.finnova.bank.auth.domain.SystemSetting;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
public interface SettingRepository extends JpaRepository<SystemSetting,String>{
    @Lock(LockModeType.PESSIMISTIC_WRITE)@Query("select s from SystemSetting s where s.key=:key")Optional<SystemSetting> lockByKey(@Param("key")String key);
}
