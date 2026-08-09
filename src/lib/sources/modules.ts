import { z } from "zod";

export const ModuleConfigSchema = z.object({
  id: z.string().regex(/^[A-Za-z][A-Za-z0-9-]*$/),
  displayName: z.string().min(1),
  repository: z.url({ protocol: /^https?$/ }),
  branch: z.string().regex(/^[A-Za-z0-9._/-]+$/),
});

export type ModuleConfig = z.infer<typeof ModuleConfigSchema>;

export const MODULES = z
  .array(ModuleConfigSchema)
  .readonly()
  .parse([
    {
      id: "ArmController",
      displayName: "ArmController",
      repository: "https://github.com/HITSZ-WTRobot-Packages/ArmController.git",
      branch: "main",
    },
    {
      id: "BasicComponents",
      displayName: "BasicComponents",
      repository: "https://github.com/HITSZ-WTRobot-Packages/BasicComponents.git",
      branch: "main",
    },
    {
      id: "ChassisController",
      displayName: "ChassisController",
      repository: "https://github.com/HITSZ-WTRobot-Packages/ChassisController.git",
      branch: "main",
    },
    {
      id: "MotorDrivers",
      displayName: "MotorDrivers",
      repository: "https://github.com/HITSZ-WTRobot-Packages/MotorDrivers.git",
      branch: "main",
    },
    {
      id: "Sensors",
      displayName: "Sensors",
      repository: "https://github.com/HITSZ-WTRobot-Packages/Sensors.git",
      branch: "main",
    },
    {
      id: "TrajectoryControl",
      displayName: "TrajectoryControl",
      repository: "https://github.com/HITSZ-WTRobot-Packages/TrajectoryControl.git",
      branch: "main",
    },
  ]);

export function findModule(
  modules: readonly ModuleConfig[],
  value: string,
): ModuleConfig | undefined {
  const normalized = value.toLocaleLowerCase("en-US");
  return modules.find(
    (module) =>
      module.id.toLocaleLowerCase("en-US") === normalized ||
      module.displayName.toLocaleLowerCase("en-US") === normalized,
  );
}
