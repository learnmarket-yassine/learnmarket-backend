import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Like `@IsInt() @Min(0) @Max(1440)`, but treats `null`/`undefined` as valid
 * on its own — pairing consistency (both set or both omitted) is enforced
 * separately by `IsValidTimeRange` on the `endTime` property. Needed
 * because `@ValidateIf`/`@IsOptional` gate an entire property's decorator
 * chain, which would also suppress `IsValidTimeRange`.
 */
@ValidatorConstraint({ name: 'IsOptionalMinutesOfDay' })
class IsOptionalMinutesOfDayConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    return (
      Number.isInteger(value) &&
      (value as number) >= 0 &&
      (value as number) <= 1440
    );
  }

  defaultMessage(): string {
    return 'must be an integer between 0 and 1440 (minutes since midnight)';
  }
}

export function IsOptionalMinutesOfDay(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsOptionalMinutesOfDayConstraint,
    });
  };
}
