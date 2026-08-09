#include "arm_motor_mit.hpp"

#include "dm.hpp"

namespace Arm
{

DMMITMotorCtrl::DMMITMotorCtrl(motors::DMMotor* driver) :
    MITMotorCtrl(driver, controllers::ControlMode::InternalMIT), dm_(driver)
{
}

bool DMMITMotorCtrl::enable()
{
    // 除了申请控制权，还顺带给 DM 驱动器发送使能报文。
    if (!controllers::IController::enable())
        return false;
    if (dm_)
        dm_->enable();
    return true;
}

void DMMITMotorCtrl::disable()
{
    if (enabled() && dm_)
        dm_->disable();
    controllers::IController::disable();
    ResetIntegral();
}

void DMMITMotorCtrl::update(const float dt)
{
    if (!enabled() || !dm_ || !getMotor())
        return;

    // DM 原生支持 MIT 五元组，因此这里只补上积分项形成总前馈。
    const float total_ff = targetTorqueFF() + calcIntegralTorque(dt);
    dm_->setInternalMIT(total_ff, targetAngle(), targetVelocity(), kp(), kd());
}

} // namespace Arm
