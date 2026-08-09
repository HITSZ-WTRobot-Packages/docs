#include "arm_slave.hpp"

#include "gpio.h"

namespace Arm
{

namespace
{
constexpr uint8_t kFlagVacuum = 0x80;
constexpr uint8_t kFlagComp   = 0x40;

struct HermiteResult
{
    float q;
    float dq;
    float ddq;
};

static HermiteResult quintic(float p0, float v0, float a0, float p1, float v1, float a1, float T, float t)
{
    HermiteResult out{};

    if (T <= 0.0f)
    {
        out.q   = p1;
        out.dq  = v1;
        out.ddq = a1;
        return out;
    }

    const float T2 = T * T;
    const float T3 = T2 * T;
    const float T4 = T3 * T;
    const float T5 = T4 * T;

    const float c0 = p0;
    const float c1 = v0;
    const float c2 = 0.5f * a0;
    const float c3 =
            (-3.0f * T2 * a0 + T2 * a1 - 12.0f * T * v0 - 8.0f * T * v1 - 20.0f * p0 + 20.0f * p1) / (2.0f * T3);
    const float c4 = (1.5f * T2 * a0 - T2 * a1 + 8.0f * T * v0 + 7.0f * T * v1 + 15.0f * p0 - 15.0f * p1) / T4;
    const float c5 =
            (-T2 * a0 + T2 * a1 - 6.0f * T * v0 - 6.0f * T * v1 - 12.0f * p0 + 12.0f * p1) / (2.0f * T5);

    const float t2 = t * t;
    const float t3 = t2 * t;
    const float t4 = t3 * t;
    const float t5 = t4 * t;

    out.q   = c0 + c1 * t + c2 * t2 + c3 * t3 + c4 * t4 + c5 * t5;
    out.dq  = c1 + 2.0f * c2 * t + 3.0f * c3 * t2 + 4.0f * c4 * t3 + 5.0f * c5 * t4;
    out.ddq = 2.0f * c2 + 6.0f * c3 * t + 12.0f * c4 * t2 + 20.0f * c5 * t3;

    return out;
}
} // namespace

Slave::Slave(Controller& controller) : controller_(controller) {}

bool Slave::pushPoint(const TrajPoint& point, uint32_t rx_time_ms)
{
    const uint32_t period_ms = rx_period_ms_ > 0 ? rx_period_ms_ : 1U;
    const float    T         = static_cast<float>(period_ms) * 0.001f;
    const uint32_t steps     = period_ms;

    const uint32_t saved    = isr_lock();
    const bool     has_prev = has_prev_;
    TrajPoint      prev     = prev_point_;
    isr_unlock(saved);

    bool ok = true;
    if (!has_prev)
    {
        const uint32_t saved2 = isr_lock();
        ok                    = queue_.push(point);
        if (ok)
        {
            prev_point_ = point;
            has_prev_   = true;
            last_rx_ms_ = rx_time_ms;
        }
        isr_unlock(saved2);
        return ok;
    }

    const float dt = T / static_cast<float>(steps > 0 ? steps : 1U);

    const uint32_t saved3 = isr_lock();
    for (uint32_t i = 1; i <= steps; ++i)
    {
        const float t = dt * static_cast<float>(i);

        const HermiteResult h1 = quintic(prev.q1, prev.dq1, prev.ddq1, point.q1, point.dq1, point.ddq1, T, t);
        const HermiteResult h2 = quintic(prev.q2, prev.dq2, prev.ddq2, point.q2, point.dq2, point.ddq2, T, t);
        const HermiteResult h3 = quintic(prev.q3, prev.dq3, prev.ddq3, point.q3, point.dq3, point.ddq3, T, t);

        TrajPoint interp = point;
        interp.q1        = h1.q;
        interp.q2        = h2.q;
        interp.q3        = h3.q;
        interp.dq1       = h1.dq;
        interp.dq2       = h2.dq;
        interp.dq3       = h3.dq;
        interp.ddq1      = h1.ddq;
        interp.ddq2      = h2.ddq;
        interp.ddq3      = h3.ddq;
        interp.flags     = (i == steps) ? point.flags : prev.flags;

        if (!queue_.push(interp))
        {
            ok = false;
            break;
        }
    }

    if (ok)
    {
        prev_point_ = point;
        has_prev_   = true;
        last_rx_ms_ = rx_time_ms;
    }
    isr_unlock(saved3);

    return ok;
}

void Slave::clear()
{
    const uint32_t saved = isr_lock();
    TrajPoint      discard{};
    while (queue_.pop(discard))
    {
    }
    isr_unlock(saved);

    next_valid_ = false;
    has_active_ = false;
    has_prev_   = false;
    prev_point_ = TrajPoint{};
    last_rx_ms_ = 0;
    timeout_ms_ = 200;
}

void Slave::setTimeoutMs(uint32_t timeout_ms)
{
    timeout_ms_ = timeout_ms;
}

void Slave::setRxPeriodMs(uint32_t period_ms)
{
    rx_period_ms_ = period_ms > 0 ? period_ms : 1U;
}

bool Slave::hasActiveTrajectory() const
{
    return has_active_ || next_valid_ || !queue_.empty();
}

void Slave::update(uint32_t now_ms, float dt)
{
    // 判断controller_有没有启用
    if (!controller_.isEnabled())
    {
        return;
    }

    bool advanced = false;
    if (!next_valid_)
    {
        const uint32_t saved = isr_lock();
        const bool     ok    = queue_.pop(next_point_);
        isr_unlock(saved);
        if (ok)
            next_valid_ = true;
    }

    if (next_valid_)
    {
        applyPoint(next_point_);
        next_valid_ = false;
        advanced    = true;
    }

    if (!advanced && has_active_)
    {
        if ((now_ms - last_rx_ms_) > timeout_ms_)
        {
            controller_.setStreamingTarget(current_point_.q1,
                                           current_point_.q2,
                                           current_point_.q3,
                                           0.0f,
                                           0.0f,
                                           0.0f,
                                           0.0f,
                                           0.0f,
                                           0.0f);
        }
    }
    controller_.update(dt);
}

void Slave::applyPoint(const TrajPoint& point)
{
    current_point_ = point;
    has_active_    = true;
    controller_.setStreamingTarget(point.q1,
                                   point.q2,
                                   point.q3,
                                   point.dq1,
                                   point.dq2,
                                   point.dq3,
                                   point.ddq1,
                                   point.ddq2,
                                   point.ddq3);

    const bool vacuum = (point.flags & kFlagVacuum) != 0U;
    HAL_GPIO_WritePin(GPIOA, GPIO_PIN_6, static_cast<GPIO_PinState>(!vacuum));
    HAL_GPIO_WritePin(GPIOC, GPIO_PIN_0, static_cast<GPIO_PinState>(!vacuum));

    const bool compensate = (point.flags & kFlagComp) != 0U;
    controller_.setPayload(compensate ? 0.6f : 0.0f, 0.5f);
}

} // namespace Arm
