#pragma once

/** Squares a value without requiring a compiled translation unit. */
template <typename T>
constexpr T square(T value) {
  return value * value;
}
