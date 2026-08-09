/** Adds two integers. */
int demo_add(int left, int right);

/** Result state. */
enum demo_state {
  /** The operation succeeded. */
  DEMO_OK = 0,
  /** The operation failed. */
  DEMO_ERROR = 1,
};
