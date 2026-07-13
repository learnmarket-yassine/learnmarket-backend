import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

const IANA_TIMEZONES = new Set(Intl.supportedValuesOf('timeZone'));

@ValidatorConstraint({ name: 'IsIanaTimezone' })
class IsIanaTimezoneConstraint implements ValidatorConstraintInterface {
  validate(value: unknown): boolean {
    return typeof value === 'string' && IANA_TIMEZONES.has(value);
  }

  defaultMessage(args: ValidationArguments): string {
    return `${args.property} must be a valid IANA timezone name (e.g. "Europe/Paris")`;
  }
}

export function IsIanaTimezone(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: IsIanaTimezoneConstraint,
    });
  };
}
