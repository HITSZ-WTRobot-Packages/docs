/**
 * @file    arm_slave.hpp
 * @brief   机械臂轨迹从机控制器
 */
#pragma once

#include "RingBuffer.hpp"
#include "arm_controller.hpp"
#include "isr_lock.h"

namespace Arm
{

class Slave
{
public:
    /**
     * 轨迹点
     */
    struct __attribute__((packed)) TrajPoint
    {
        uint16_t index;
        float    q1;
        float    q2;
        float    q3;
        float    dq1;
        float    dq2;
        float    dq3;
        float    ddq1;
        float    ddq2;
        float    ddq3;
        uint8_t  flags;
    };

    /**
     * 构造从机控制器
     * @param controller 机械臂控制器
     */
    explicit Slave(Controller& controller);

    /**
     * 推入轨迹点
     * @param point 轨迹点
     * @param rx_time_ms 接收时间戳
     * @return 是否推入成功
     */
    bool pushPoint(const TrajPoint& point, uint32_t rx_time_ms);

    /**
     * 清空轨迹缓存
     */
    void clear();

    /**
     * 设置超时时间
     * @param timeout_ms 超时(ms)
     */
    void setTimeoutMs(uint32_t timeout_ms);

    /**
     * 设置上位机轨迹点周期
     * @param period_ms 轨迹点周期(ms)
     */
    void setRxPeriodMs(uint32_t period_ms);

    /**
     * 执行轨迹队列
     * @param now_ms 当前时间戳
     * @param dt 控制周期(s)
     */
    void update(uint32_t now_ms, float dt);

    /**
     * 是否有有效轨迹
     * @return 有轨迹则为true
     */
    bool hasActiveTrajectory() const;

private:
    /**
     * 轨迹点队列容量
     */
    static constexpr size_t kBufferCapacity = 2049;

    /**
     * 应用轨迹点
     * @param point 轨迹点
     */
    void applyPoint(const TrajPoint& point);

    Controller&                                  controller_;
    libs::RingBuffer<TrajPoint, kBufferCapacity> queue_{};

    TrajPoint next_point_{};
    bool      next_valid_{ false };

    TrajPoint current_point_{};
    bool      has_active_{ false };

    TrajPoint prev_point_{};
    bool      has_prev_{ false };

    uint32_t last_rx_ms_{ 0 };
    uint32_t timeout_ms_{ 200 };
    uint32_t rx_period_ms_{ 5 };
};

} // namespace Arm
