#pragma once

#include <algorithm>
#include <cmath>
#include <cstdint>

#include "motor_if.hpp"

namespace motors
{
class DJIMotor;
class DMMotor;
} // namespace motors

namespace Arm
{

/**
 * MIT 控制抽象基类：
 * - 管理 MIT 参数、目标值、积分项
 * - 统一通过 `getMotor()` 读取角度 / 速度 / 在线状态
 * - 派生类只处理具体驱动的命令下发差异
 *
 * 单位约定：
 * - 角度：deg
 * - 角速度：deg/s
 * - 前馈力矩：Nm
 *
 * 注意底层 `IMotor::getVelocity()` 的统一单位是 rpm，
 * 这里对外统一换算成 deg/s，方便机械臂控制层直接使用。
 */
class MITMotorCtrl : public controllers::IController
{
public:
    ~MITMotorCtrl() override = default;

    void SetMitParams(float kp, float kd, float ki, float i_limit)
    {
        kp_      = kp;
        kd_      = kd;
        ki_      = ki;
        i_limit_ = i_limit;
        sum_err_ = 0.0f;
    }

    void SetIntegralEnable(bool enable)
    {
        i_enable_ = enable;
        if (!enable)
            sum_err_ = 0.0f;
    }

    void ResetIntegral() { sum_err_ = 0.0f; }

    void setTarget(float angle_ref, float velocity_ref, float torque_ff)
    {
        target_angle_     = angle_ref;
        target_velocity_  = velocity_ref;
        target_torque_ff_ = torque_ff;
    }

    // void setEnable(bool enable)
    // {
    //     if (enable)
    //         this->enable();
    //     else
    //         this->disable();
    // }

    bool isEnabled() const { return enabled(); }

    /**
     * 无 dt 版本仅作为 IController 适配入口使用。
     * 机械臂控制链路里通常应调用带 dt 的版本。
     */
    void update() override { update(0.0f); }
    virtual void update(float dt) = 0;

    /**
     * 获取输出轴角度，单位 deg。
     */
    float getAngle() const
    {
        const auto* motor = getMotor();
        return motor ? motor->getAngle() : 0.0f;
    }

    /**
     * 获取输出轴角速度，单位 deg/s。
     */
    float getVelocity() const
    {
        const auto* motor = getMotor();
        return motor ? motor->getVelocity() * kRpmToDegPerSec : 0.0f;
    }

    /**
     * 电机当前是否在线。
     */
    bool isConnected() const
    {
        const auto* motor = getMotor();
        return motor ? motor->isConnected() : false;
    }


protected:
    static constexpr float kRpmToDegPerSec = 360.0f / 60.0f;

    MITMotorCtrl(motors::IMotor* motor, controllers::ControlMode ctrl_mode) :
        controllers::IController(motor, ctrl_mode)
    {
    }

    /**
     * 计算位置误差积分项，返回值的物理意义是附加前馈力矩（Nm）。
     */
    float calcIntegralTorque(float dt)
    {
        if (!i_enable_)
        {
            sum_err_ = 0.0f;
            return 0.0f;
        }

        if (!isConnected() || ki_ <= 1.0e-6f)
            return 0.0f;

        const float pos_err = target_angle_ - getAngle();
        sum_err_ += pos_err * dt;

        float torque_integral = sum_err_ * ki_;
        if (i_limit_ > 0.0f)
        {
            torque_integral = std::clamp(torque_integral, -i_limit_, i_limit_);
            sum_err_        = torque_integral / ki_;
        }

        return torque_integral;
    }

    float kp() const { return kp_; }
    float kd() const { return kd_; }
    float targetAngle() const { return target_angle_; }
    float targetVelocity() const { return target_velocity_; }
    float targetTorqueFF() const { return target_torque_ff_; }

private:
    float kp_{ 0.0f };
    float kd_{ 0.0f };
    float ki_{ 0.0f };
    float i_limit_{ 0.0f };

    bool  i_enable_{ true };
    float sum_err_{ 0.0f };

    float target_angle_{ 0.0f };
    float target_velocity_{ 0.0f };
    float target_torque_ff_{ 0.0f };
};

class DJIMITMotorCtrl final : public MITMotorCtrl
{
public:
    /**
     * DJI 不支持原生 MIT 五元组，因此这里在 MCU 侧做 MIT 风格控制，
     * 再通过 `torque_ratio` 把期望力矩换成驱动电流命令。
     */
    DJIMITMotorCtrl(motors::DJIMotor* driver, float torque_ratio);

    void update(float dt) override;
    // bool rotateUntilStall(int direction, float current, float position_threshold_deg,
    //                       uint32_t stall_time_ms, uint32_t timeout_ms) override;

private:
    void outputControl(float torque_nm);

    motors::DJIMotor* dji_{ nullptr };
    float             torque_ratio_{ 1.0f };
};

class DMMITMotorCtrl final : public MITMotorCtrl
{
public:
    /**
     * DM 原生支持 MIT 接口，因此这里只需要维护公共状态并直接下发。
     */
    explicit DMMITMotorCtrl(motors::DMMotor* driver);

    bool enable() override;
    void disable() override;
    void update(float dt) override;

private:
    motors::DMMotor* dm_{ nullptr };
};

} // namespace Arm
