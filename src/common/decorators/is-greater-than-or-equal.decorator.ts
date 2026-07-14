import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

/**
 * Mirrors a DB CHECK constraint of the form
 * `a IS NULL OR b IS NULL OR b >= a`: either side missing -> valid,
 * both present -> valid only if this property's value >= the related one.
 */
@ValidatorConstraint({ name: 'IsGreaterThanOrEqual' })
class IsGreaterThanOrEqualConstraint implements ValidatorConstraintInterface {
  validate(value: unknown, args: ValidationArguments): boolean {
    const [relatedProperty] = args.constraints as [string];
    const relatedValue = (args.object as Record<string, unknown>)[
      relatedProperty
    ];

    if (value === null || value === undefined) return true;
    if (relatedValue === null || relatedValue === undefined) return true;
    return Number(value) >= Number(relatedValue);
  }

  defaultMessage(args: ValidationArguments): string {
    const [relatedProperty] = args.constraints as [string];
    return `${args.property} must be greater than or equal to ${relatedProperty}`;
  }
}

export function IsGreaterThanOrEqual(
  relatedProperty: string,
  validationOptions?: ValidationOptions,
) {
  return (object: object, propertyName: string) => {
    registerDecorator({
      target: object.constructor,
      propertyName,
      options: validationOptions,
      constraints: [relatedProperty],
      validator: IsGreaterThanOrEqualConstraint,
    });
  };
}
