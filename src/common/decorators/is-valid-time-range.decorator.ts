import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Applied to an `endTime` property, comparing it against a related
 * `startTime` property. Mirrors the DB CHECK constraints so writes fail
 * fast with a 400 instead of hitting the database:
 *  - both null/undefined -> valid (whole-day / not-applicable case)
 *  - both set -> valid only if endTime > startTime
 *  - exactly one set -> invalid
 */
@ValidatorConstraint({ name: 'IsValidTimeRange' })
class IsValidTimeRangeConstraint implements ValidatorConstraintInterface {
  validate(endTime: unknown, args: ValidationArguments): boolean {
    const [startProperty] = args.constraints as [string];
    const startTime = (args.object as Record<string, unknown>)[startProperty];

    const startMissing = startTime === null || startTime === undefined;
    const endMissing = endTime === null || endTime === undefined;

    if (startMissing && endMissing) return true;
    if (startMissing !== endMissing) return false;
    return (endTime as number) > (startTime as number);
  }

  defaultMessage(args: ValidationArguments): string {
    const [startProperty] = args.constraints as [string];
    return `${args.property} must be greater than ${startProperty}, and both must be either set or omitted together`;
  }
}

export function IsValidTimeRange(
  startProperty: string,
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [startProperty],
      validator: IsValidTimeRangeConstraint,
    });
  };
}
