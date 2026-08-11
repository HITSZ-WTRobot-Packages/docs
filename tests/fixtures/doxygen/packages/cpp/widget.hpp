#pragma once

namespace fixture {

/** A polymorphic value provider. */
class ValueProvider {
 public:
  /** Reads the current value. */
  virtual int value() const = 0;
};

/** Stores the protected widget identifier. */
struct Identified {
 protected:
  int identifier = 0;
};

/** A compiled C++ fixture. */
class Widget : public virtual ValueProvider, protected Identified {
 public:
  static int instances;

  /** Returns the configured value. */
  int value() const override;
};

}  // namespace fixture
