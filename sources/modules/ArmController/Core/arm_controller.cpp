#include "arm_controller.hpp"

#include <cmath>

#ifndef M_PI
#    define M_PI 3.14159265358979323846f
#endif

namespace Arm
{

static constexpr float DEG_TO_RAD = M_PI / 180.0f;

Controller::Controller(MITMotorCtrl& joint1,
                       MITMotorCtrl& joint2,
                       MITMotorCtrl& joint3,
                       const Config& config) :
    joint1_(joint1), joint2_(joint2), joint3_(joint3), config_(config)
{
    G3_ = config_.m3 * config_.g * config_.lc3;
    G2_ = (config_.m2 * config_.lc2 + config_.m3 * config_.l2) * config_.g;
    G1_ = (config_.m1 * config_.lc1 + config_.m2 * config_.l1 + config_.m3 * config_.l1) *
          config_.g;

    G_payload_factor_3_ = config_.g * (config_.l3 + config_.lc_payload);
    G_payload_factor_2_ = config_.g * config_.l2;
    G_payload_factor_1_ = config_.g * config_.l1;
}

// Initialize references based on current encoder feedback.
void Controller::init()
{
    soft_start_scale_ = 0.0f;
    last_connected_   = false;

    joint1_.disable();
    joint2_.disable();
    joint3_.disable();

    joint1_.update(0.0f);
    joint2_.update(0.0f);
    joint3_.update(0.0f);

    motor1_init_pos_ = 0.0f;
    if (joint1_.getAngle() * DEG_TO_RAD < -1.0f)
        motor1_init_pos_ = -360.0f;

    motor2_init_pos_ = joint2_.getAngle();
    motor3_init_pos_ = 0.0f;

    // DM 电机不需要设定初始位置
    float q1_deg = (joint1_.getAngle() / config_.reduction_1) + config_.offset_1;
    float q2_deg = config_.offset_2;
    float q3_deg = (joint3_.getAngle() / config_.reduction_3) + config_.offset_3;

    current_q1_ref_ = q1_deg;
    current_q2_ref_ = q2_deg;
    current_q3_ref_ = q3_deg;

    current_q1_vel_ref_ = 0.0f;
    current_q2_vel_ref_ = 0.0f;
    current_q3_vel_ref_ = 0.0f;
    current_q1_acc_ref_ = 0.0f;
    current_q2_acc_ref_ = 0.0f;
    current_q3_acc_ref_ = 0.0f;
    streaming_enabled_  = false;

    joint1_.enable();
    joint2_.enable();
    joint3_.enable();

    is_init_ = true;
}

// Update payload mass used in gravity compensation.
void Controller::setPayload(float mass, float ramp_time)
{
    target_payload_mass_ = mass;
    if (ramp_time > 0.001f)
    {
        payload_ramp_rate_ = std::fabs(mass - current_payload_mass_) / ramp_time;
    }
    else
    {
        current_payload_mass_ = mass;
        payload_ramp_rate_    = 0.0f;
    }
}

// Apply streaming reference from the host.
void Controller::setStreamingTarget(float q1,
                                    float q2,
                                    float q3,
                                    float dq1,
                                    float dq2,
                                    float dq3,
                                    float ddq1,
                                    float ddq2,
                                    float ddq3)
{
    current_q1_ref_     = q1;
    current_q2_ref_     = q2;
    current_q3_ref_     = q3;
    current_q1_vel_ref_ = dq1;
    current_q2_vel_ref_ = dq2;
    current_q3_vel_ref_ = dq3;
    current_q1_acc_ref_ = ddq1;
    current_q2_acc_ref_ = ddq2;
    current_q3_acc_ref_ = ddq3;
    streaming_enabled_  = true;
}

void Controller::update(float dt)
{
    // 如果没有初始化
    if (!is_init_)
    {
        return;
    }

    const bool any_disconnected = !joint1_.isConnected() || !joint2_.isConnected() ||
                                  !joint3_.isConnected();
    const bool current_connected = !any_disconnected;

    if (!last_connected_ && current_connected)
    { // 断联逻辑
        float q1_real, q2_real, q3_real;
        getJointAngles(q1_real, q2_real, q3_real);

        current_q1_ref_     = q1_real;
        current_q1_vel_ref_ = 0.0f;
        current_q1_acc_ref_ = 0.0f;

        current_q2_ref_     = q2_real;
        current_q2_vel_ref_ = 0.0f;
        current_q2_acc_ref_ = 0.0f;

        current_q3_ref_     = q3_real;
        current_q3_vel_ref_ = 0.0f;
        current_q3_acc_ref_ = 0.0f;
        streaming_enabled_  = false;
    }
    last_connected_ = current_connected;

    // 末端重力补偿逻辑
    if (payload_ramp_rate_ > 0.0f)
    {
        float diff = target_payload_mass_ - current_payload_mass_;
        float step = payload_ramp_rate_ * dt;
        if (std::fabs(diff) <= step)
            current_payload_mass_ = target_payload_mass_;
        else
            current_payload_mass_ += (diff > 0 ? step : -step);
    }

    if (soft_start_scale_ < 1.0f)
    {
        soft_start_scale_ += dt / soft_start_duration_;
        if (soft_start_scale_ > 1.0f)
            soft_start_scale_ = 1.0f;
    }

    const float q1_vel_ref = streaming_enabled_ ? current_q1_vel_ref_ : 0.0f;
    const float q2_vel_ref = streaming_enabled_ ? current_q2_vel_ref_ : 0.0f;
    const float q3_vel_ref = streaming_enabled_ ? current_q3_vel_ref_ : 0.0f;
    const float q1_acc_ref = streaming_enabled_ ? current_q1_acc_ref_ : 0.0f;
    const float q2_acc_ref = streaming_enabled_ ? current_q2_acc_ref_ : 0.0f;
    const float q3_acc_ref = streaming_enabled_ ? current_q3_acc_ref_ : 0.0f;

    joint1_.SetIntegralEnable(!streaming_enabled_);
    joint2_.SetIntegralEnable(!streaming_enabled_);
    joint3_.SetIntegralEnable(!streaming_enabled_);

    float q1_real, q2_real, q3_real;
    getJointAngles(q1_real, q2_real, q3_real);

    float q1_rad = q1_real * DEG_TO_RAD;
    float q2_rad = q2_real * DEG_TO_RAD;
    float q3_rad = q3_real * DEG_TO_RAD;

    float tau1_g = 0.0f;
    float tau2_g = 0.0f;
    float tau3_g = 0.0f;
    calculateGravityComp(q1_rad, q2_rad, q3_rad, tau1_g, tau2_g, tau3_g);

    float tau1_c = 0.0f;
    float tau2_c = 0.0f;
    float tau3_c = 0.0f;
    calculateCoriolisComp(q1_rad,
                          q2_rad,
                          q3_rad,
                          q1_vel_ref * DEG_TO_RAD,
                          q2_vel_ref * DEG_TO_RAD,
                          q3_vel_ref * DEG_TO_RAD,
                          tau1_c,
                          tau2_c,
                          tau3_c);

    float tau1_i = 0.0f;
    float tau2_i = 0.0f;
    float tau3_i = 0.0f;
    calculateInertiaComp(q1_rad,
                         q2_rad,
                         q3_rad,
                         q1_acc_ref * DEG_TO_RAD,
                         q2_acc_ref * DEG_TO_RAD,
                         q3_acc_ref * DEG_TO_RAD,
                         tau1_i,
                         tau2_i,
                         tau3_i);

    float tau1_ff = (tau1_g + tau1_c + tau1_i) * soft_start_scale_;
    float tau2_ff = (tau2_g + tau2_c + tau2_i) * soft_start_scale_;
    float tau3_ff = (tau3_g + tau3_c + tau3_i) * soft_start_scale_;

    const float torque_threshold = 0.3f;

    auto get_comp_dir = [&](float torque) -> float
    {
        if (torque > torque_threshold)
            return 1.0f;
        if (torque < -torque_threshold)
            return -1.0f;
        return 0.0f;
    };

    float q1_target = current_q1_ref_ + get_comp_dir(tau1_g) * config_.backlash_1 * 0.5f;
    float q2_target = current_q2_ref_ + get_comp_dir(tau2_g) * config_.backlash_2 * 0.5f;
    float q3_target = current_q3_ref_ + get_comp_dir(tau3_g) * config_.backlash_3 * 0.5f;

    joint1_.setTarget((q1_target - config_.offset_1) * config_.reduction_1 + motor1_init_pos_,
                      q1_vel_ref * config_.reduction_1,
                      tau1_ff / config_.reduction_1);

    joint2_.setTarget((q2_target - config_.offset_2) * config_.reduction_2 + motor2_init_pos_,
                      q2_vel_ref * config_.reduction_2,
                      tau2_ff / config_.reduction_2);

    joint3_.setTarget((q3_target - config_.offset_3) * config_.reduction_3 + motor3_init_pos_,
                      q3_vel_ref * config_.reduction_3,
                      tau3_ff / config_.reduction_3);

    joint1_.update(dt);
    joint2_.update(dt);
    joint3_.update(dt);
}

// Forward kinematics for the end-effector pose.
void Controller::getEndEffectorPose(float& x, float& y, float& phi) const
{
    float q1 = ((joint1_.getAngle() - motor1_init_pos_) / config_.reduction_1) + config_.offset_1;
    float q2 = ((joint2_.getAngle() - motor2_init_pos_) / config_.reduction_2) + config_.offset_2;
    float q3 = ((joint3_.getAngle() - motor3_init_pos_) / config_.reduction_3) + config_.offset_3;

    float q1_rad = q1 * DEG_TO_RAD;
    float q2_rad = q2 * DEG_TO_RAD;
    float q3_rad = q3 * DEG_TO_RAD;

    float l1 = config_.l1;
    float l2 = config_.l2;
    float l3 = config_.l3;

    float q12  = q1_rad + q2_rad;
    float q123 = q1_rad + q2_rad + q3_rad;

    x = l1 * std::cos(q1_rad) + l2 * std::cos(q12) + l3 * std::cos(q123);
    y = l1 * std::sin(q1_rad) + l2 * std::sin(q12) + l3 * std::sin(q123);

    phi = q123;
}

// Read joint angles from motor positions.
void Controller::getJointAngles(float& q1, float& q2, float& q3) const
{
    q1 = ((joint1_.getAngle() - motor1_init_pos_) / config_.reduction_1) + config_.offset_1;
    q2 = ((joint2_.getAngle() - motor2_init_pos_) / config_.reduction_2) + config_.offset_2;
    q3 = ((joint3_.getAngle() - motor3_init_pos_) / config_.reduction_3) + config_.offset_3;
}

void Controller::getJointAnglesComp(float& q1, float& q2, float& q3)
{
    getJointAngles(q1, q2, q3);

    float q1_rad = q1 * DEG_TO_RAD;
    float q2_rad = q2 * DEG_TO_RAD;
    float q3_rad = q3 * DEG_TO_RAD;

    float tau1_g = 0.0f;
    float tau2_g = 0.0f;
    float tau3_g = 0.0f;
    calculateGravityComp(q1_rad, q2_rad, q3_rad, tau1_g, tau2_g, tau3_g);

    const float torque_threshold = 0.3f;

    auto get_comp_dir = [&](float torque) -> float
    {
        if (torque > torque_threshold)
            return 1.0f;
        if (torque < -torque_threshold)
            return -1.0f;
        return 0.0f;
    };

    q1 -= get_comp_dir(tau1_g) * config_.backlash_1 * 0.5f;
    q2 -= get_comp_dir(tau2_g) * config_.backlash_2 * 0.5f;
    q3 -= get_comp_dir(tau3_g) * config_.backlash_3 * 0.5f;
}

void Controller::getJointVelocities(float& dq1, float& dq2, float& dq3) const
{
    dq1 = joint1_.getVelocity() / config_.reduction_1;
    dq2 = joint2_.getVelocity() / config_.reduction_2;
    dq3 = joint3_.getVelocity() / config_.reduction_3;
}

// Compute gravity compensation torques for the current payload.
void Controller::calculateGravityComp(
        float q1, float q2, float q3, float& tau1, float& tau2, float& tau3)
{
    float c1   = std::cos(q1);
    float c12  = std::cos(q1 + q2);
    float c123 = std::cos(q1 + q2 + q3);

    float G3_eff = G3_ + current_payload_mass_ * G_payload_factor_3_;
    float G2_eff = G2_ + current_payload_mass_ * G_payload_factor_2_;
    float G1_eff = G1_ + current_payload_mass_ * G_payload_factor_1_;

    tau3 = G3_eff * c123;

    float term2 = G2_eff * c12;
    tau2        = term2 + tau3;

    float term1 = G1_eff * c1;
    tau1        = term1 + tau2;
}

void Controller::calculateCoriolisComp(float  q1,
                                       float  q2,
                                       float  q3,
                                       float  dq1,
                                       float  dq2,
                                       float  dq3,
                                       float& tau1,
                                       float& tau2,
                                       float& tau3)
{
    (void) q1;

    const float s2  = std::sin(q2);
    const float s3  = std::sin(q3);
    const float s23 = std::sin(q2 + q3);

    const float payload_radius = config_.l3 + config_.lc_payload;
    const float m3_eff         = config_.m3 + current_payload_mass_;
    const float lc3_eff =
            (m3_eff > 1.0e-9f)
                    ? ((config_.m3 * config_.lc3 + current_payload_mass_ * payload_radius) / m3_eff)
                    : config_.lc3;

    const float h12 = -(config_.m2 * config_.l1 * config_.lc2 + m3_eff * config_.l1 * config_.l2) *
                              s2 -
                      m3_eff * config_.l1 * lc3_eff * s23;
    const float h13 = -m3_eff * config_.l1 * lc3_eff * s23;
    const float h23 = -m3_eff * config_.l2 * lc3_eff * s3;

    tau1 = h12 * (2.0f * dq1 * dq2 + dq2 * dq2) +
           h13 * (2.0f * dq1 * dq3 + 2.0f * dq2 * dq3 + dq3 * dq3) +
           h23 * (2.0f * dq1 * dq3 + 2.0f * dq2 * dq3 + dq3 * dq3);

    tau2 = -h12 * dq1 * dq1 + h23 * (2.0f * dq1 * dq3 + 2.0f * dq2 * dq3 + dq3 * dq3);

    tau3 = -h13 * dq1 * dq1 - h23 * (dq1 + dq2) * (dq1 + dq2);
}

void Controller::calculateInertiaComp(float  q1,
                                      float  q2,
                                      float  q3,
                                      float  ddq1,
                                      float  ddq2,
                                      float  ddq3,
                                      float& tau1,
                                      float& tau2,
                                      float& tau3)
{
    (void) q1;

    const float c2  = std::cos(q2);
    const float c3  = std::cos(q3);
    const float c23 = std::cos(q2 + q3);

    const float payload_ratio   = (config_.m_payload > 1.0e-9f)
                                          ? (current_payload_mass_ / config_.m_payload)
                                          : 0.0f;
    const float payload_radius  = config_.l3 + config_.lc_payload;
    const float payload_inertia = payload_ratio * config_.I_payload;
    const float m3_eff          = config_.m3 + current_payload_mass_;
    const float lc3_eff =
            (m3_eff > 1.0e-9f)
                    ? ((config_.m3 * config_.lc3 + current_payload_mass_ * payload_radius) / m3_eff)
                    : config_.lc3;
    const float I3_eff = config_.I3 + payload_inertia + config_.m3 * config_.lc3 * config_.lc3 +
                         current_payload_mass_ * payload_radius * payload_radius -
                         m3_eff * lc3_eff * lc3_eff;

    const float m11 = config_.I1 + config_.I2 + I3_eff + config_.m1 * config_.lc1 * config_.lc1 +
                      config_.m2 * (config_.l1 * config_.l1 + config_.lc2 * config_.lc2 +
                                    2.0f * config_.l1 * config_.lc2 * c2) +
                      m3_eff * (config_.l1 * config_.l1 + config_.l2 * config_.l2 +
                                lc3_eff * lc3_eff + 2.0f * config_.l1 * config_.l2 * c2 +
                                2.0f * config_.l1 * lc3_eff * c23 +
                                2.0f * config_.l2 * lc3_eff * c3);

    const float m12 = config_.I2 + I3_eff +
                      config_.m2 * (config_.lc2 * config_.lc2 + config_.l1 * config_.lc2 * c2) +
                      m3_eff * (config_.l2 * config_.l2 + lc3_eff * lc3_eff +
                                config_.l1 * config_.l2 * c2 + config_.l1 * lc3_eff * c23 +
                                2.0f * config_.l2 * lc3_eff * c3);

    const float m13 = I3_eff + m3_eff * (lc3_eff * lc3_eff + config_.l1 * lc3_eff * c23 +
                                         config_.l2 * lc3_eff * c3);

    const float m22 = config_.I2 + I3_eff + config_.m2 * config_.lc2 * config_.lc2 +
                      m3_eff * (config_.l2 * config_.l2 + lc3_eff * lc3_eff +
                                2.0f * config_.l2 * lc3_eff * c3);

    const float m23 = I3_eff + m3_eff * (lc3_eff * lc3_eff + config_.l2 * lc3_eff * c3);

    const float m33 = I3_eff + m3_eff * lc3_eff * lc3_eff;

    tau1 = m11 * ddq1 + m12 * ddq2 + m13 * ddq3;
    tau2 = m12 * ddq1 + m22 * ddq2 + m23 * ddq3;
    tau3 = m13 * ddq1 + m23 * ddq2 + m33 * ddq3;
}

} // namespace Arm
