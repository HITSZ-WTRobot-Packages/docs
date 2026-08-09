#pragma once

#include "arm_motor_mit.hpp"

namespace Arm
{

class Controller
{
public:
    /**
     * 机械臂参数配置
     */
    struct Config
    {
        float l1;
        float l2;
        float l3;

        float lc1;
        float lc2;
        float lc3;

        float m1;
        float m2;
        float m3;

        // 转动惯量（绕其质心垂直转动平面的轴）
        float I1;
        float I2;
        float I3;

        // 负载相关信息
        float m_payload;
        float lc_payload;
        float I_payload;

        // 重力加速度
        float g;

        // 减速比
        float reduction_1;
        float reduction_2;
        float reduction_3;

        // 初始上电时的位置，仅 DM 使用
        float offset_1;
        float offset_2;
        float offset_3;

        // 回程差
        float backlash_1;
        float backlash_2;
        float backlash_3;
    };

    /**
     * 构造控制器
     * @param joint1 关节1电机
     * @param joint2 关节2电机
     * @param joint3 关节3电机
     * @param config 机械臂参数
     */
    Controller(MITMotorCtrl& joint1,
               MITMotorCtrl& joint2,
               MITMotorCtrl& joint3,
               const Config& config);

    /**
     * 初始化电机与内部参考值
     */
    void init();

    /**
     * 设置流式目标
     * @param q1 关节1角度(度)
     * @param q2 关节2角度(度)
     * @param q3 关节3角度(度)
     * @param dq1 关节1角速度(度/s)
     * @param dq2 关节2角速度(度/s)
     * @param dq3 关节3角速度(度/s)
     * @param ddq1 关节1角加速度(度/s^2)
     * @param ddq2 关节2角加速度(度/s^2)
     * @param ddq3 关节3角加速度(度/s^2)
     */
    void setStreamingTarget(
            float q1, float q2, float q3, float dq1, float dq2, float dq3, float ddq1, float ddq2, float ddq3);

    /**
     * 设置负载质量
     * @param mass 负载质量
     * @param ramp_time 质量变化平滑时间
     */
    void setPayload(float mass, float ramp_time = 0.5f);

    /**
     * 执行一次控制周期
     * @param dt 周期时间(s)
     */
    void update(float dt);

    /**
     * 获取末端位姿
     * @param x 末端x
     * @param y 末端y
     * @param phi 末端姿态角
     */
    void getEndEffectorPose(float& x, float& y, float& phi) const;

    /**
     * 获取关节角
     * @param q1 关节1角度(度)
     * @param q2 关节2角度(度)
     * @param q3 关节3角度(度)
     */
    void getJointAngles(float& q1, float& q2, float& q3) const;

    /**
     * 获取补偿回程差后的关节角（与目标语义一致）
     * @param q1 关节1角度(度)
     * @param q2 关节2角度(度)
     * @param q3 关节3角度(度)
     */
    void getJointAnglesComp(float& q1, float& q2, float& q3);

    /**
     * 获取关节角速度
     * @param dq1 关节1角速度(度/s)
     * @param dq2 关节2角速度(度/s)
     * @param dq3 关节3角速度(度/s)
     */
    void getJointVelocities(float& dq1, float& dq2, float& dq3) const;

    bool isEnabled()
    {
        return is_init_;
    }

private:
    /**
     * 计算重力补偿力矩
     * @param q1 关节1角度(弧度)
     * @param q2 关节2角度(弧度)
     * @param q3 关节3角度(弧度)
     * @param tau1 关节1力矩输出
     * @param tau2 关节2力矩输出
     * @param tau3 关节3力矩输出
     */
    void calculateGravityComp(float q1, float q2, float q3, float& tau1, float& tau2, float& tau3);

    /**
     * 计算科里奥利/离心补偿力矩
     * 基于平面 3R 刚体模型：tau_c = C(q, dq) * dq
     * @param q1 关节1角度(弧度)
     * @param q2 关节2角度(弧度)
     * @param q3 关节3角度(弧度)
     * @param dq1 关节1角速度(弧度/s)
     * @param dq2 关节2角速度(弧度/s)
     * @param dq3 关节3角速度(弧度/s)
     * @param tau1 关节1力矩输出
     * @param tau2 关节2力矩输出
     * @param tau3 关节3力矩输出
     */
    void calculateCoriolisComp(float  q1,
                               float  q2,
                               float  q3,
                               float  dq1,
                               float  dq2,
                               float  dq3,
                               float& tau1,
                               float& tau2,
                               float& tau3);

    /**
     * 计算转动惯量补偿力矩
     * 基于平面 3R 刚体模型：tau_i = M(q) * ddq
     * @param q1 关节1角度(弧度)
     * @param q2 关节2角度(弧度)
     * @param q3 关节3角度(弧度)
     * @param ddq1 关节1角加速度(弧度/s^2)
     * @param ddq2 关节2角加速度(弧度/s^2)
     * @param ddq3 关节3角加速度(弧度/s^2)
     * @param tau1 关节1力矩输出
     * @param tau2 关节2力矩输出
     * @param tau3 关节3力矩输出
     */
    void calculateInertiaComp(float  q1,
                              float  q2,
                              float  q3,
                              float  ddq1,
                              float  ddq2,
                              float  ddq3,
                              float& tau1,
                              float& tau2,
                              float& tau3);

    bool last_connected_{ false };
    bool is_init_{ false };

    MITMotorCtrl& joint1_;
    MITMotorCtrl& joint2_;
    MITMotorCtrl& joint3_;

    Config config_;

    float current_q1_ref_{ 0.0f };
    float current_q2_ref_{ 0.0f };
    float current_q3_ref_{ 0.0f };

    float current_q1_vel_ref_{ 0.0f };
    float current_q2_vel_ref_{ 0.0f };
    float current_q3_vel_ref_{ 0.0f };

    float current_q1_acc_ref_{ 0.0f };
    float current_q2_acc_ref_{ 0.0f };
    float current_q3_acc_ref_{ 0.0f };

    bool streaming_enabled_{ false };

    float motor1_init_pos_{ 0.0f };
    float motor2_init_pos_{ 0.0f };
    float motor3_init_pos_{ 0.0f };

    float G1_{ 0.0f };
    float G2_{ 0.0f };
    float G3_{ 0.0f };

    float G_payload_factor_1_{ 0.0f };
    float G_payload_factor_2_{ 0.0f };
    float G_payload_factor_3_{ 0.0f };

    float current_payload_mass_{ 0.0f };
    float target_payload_mass_{ 0.0f };
    float payload_ramp_rate_{ 0.0f };

    float soft_start_scale_{ 0.0f };
    float soft_start_duration_{ 2.0f };
};

} // namespace Arm
