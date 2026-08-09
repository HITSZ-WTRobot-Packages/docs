#include "arm_motor_mit.hpp"

#include "cmsis_os2.h"
#include "dji.hpp"

namespace Arm
{

DJIMITMotorCtrl::DJIMITMotorCtrl(motors::DJIMotor* driver, const float torque_ratio) :
    MITMotorCtrl(driver, controllers::ControlMode::ExternalPID), dji_(driver), torque_ratio_(torque_ratio)
{
}

void DJIMITMotorCtrl::update(const float dt)
{
    if (!enabled() || !getMotor())
        return;

    // DJI 没有原生 MIT 五元组，因此在 MCU 侧做一层 MIT 风格的 P+D+I 计算。
    if (!isConnected())
    {
        // 掉线时仅保留前馈项，避免基于异常反馈继续闭环。
        outputControl(targetTorqueFF());
        return;
    }

    const float pos_err = targetAngle() - getAngle();
    const float vel_err = targetVelocity() - getVelocity();

    const float total_ff = targetTorqueFF() + calcIntegralTorque(dt);
    const float torque_mit = kp() * pos_err + kd() * vel_err;

    outputControl(torque_mit + total_ff);
}

void DJIMITMotorCtrl::outputControl(const float torque_nm)
{
    auto* motor = getMotor();
    if (!motor)
        return;

    // 按经验比例把期望力矩换成电流命令，并做简单限幅保护。
    float iq = torque_nm * torque_ratio_;
    iq       = std::clamp(iq, -8000.0f, 8000.0f);
    motor->setCurrent(iq);
}
/*
bool DJIMITMotorCtrl::rotateUntilStall(int            direction,
                                       float          current,
                                       float          position_threshold_deg,
                                       uint32_t       stall_time_ms,
                                       const uint32_t timeout_ms)
{
    auto* motor = getMotor();
    if (!motor || !dji_)
        return false;

    // 这是给标定/回零等流程用的阻塞式工具函数，不参与常规控制闭环。
    if (!enabled())
    {
        enable();
        osDelay(100);
    }

    float last_position = getAngle();

    float target_current = direction > 0 ? current : -current;
    target_current       = std::clamp(target_current, -8000.0f, 8000.0f);

    const uint32_t start_time = osKernelGetTickCount();
    uint32_t       stall_start = 0;
    bool           stall_started = false;

    while (true)
    {
        const uint32_t elapsed = osKernelGetTickCount() - start_time;
        if (elapsed >= timeout_ms)
        {
            motor->setCurrent(0.0f);
            return false;
        }

        // 这里只是写入 DJI 电流缓存；真正发 CAN 仍依赖外层统一发送流程。
        motor->setCurrent(target_current);

        const float current_angle = getAngle();
        const float position_delta = std::fabs(current_angle - last_position);

        if (position_delta < position_threshold_deg)
        {
            if (!stall_started)
            {
                stall_started = true;
                stall_start   = osKernelGetTickCount();
            }
            else if (osKernelGetTickCount() - stall_start >= stall_time_ms)
            {
                motor->setCurrent(0.0f);
                return true;
            }
        }
        else
        {
            stall_started = false;
            last_position = current_angle;
        }

        osDelay(10);
    }
}*/

} // namespace Arm
