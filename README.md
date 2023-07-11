# graphql-transform-scalars

Transform the response of your graphql request with mapper functions for your custom scalar types.

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm version](https://badge.fury.io/js/graphql-transform-scalars.svg)](https://badge.fury.io/js/graphql-transform-scalars)

## Installation
Install with yarn or npm:

```sh
yarn add graphql-transform-scalars
```
or
```sh
npm install graphql-transform-scalars
```


## Usage with graphql-request

### With graphql-codegen

```typescript
import { GraphQLClient } from 'graphql-request';
import fs from 'fs';
import { CalendarDate } from 'calendar-date';
import { getSdkWrapper, TransformCustomScalars } from 'graphql-transform-scalars';
import { getSdk } from './generated/graphql';

// Custom Scalar definition
const customScalarDefinitions = [
    {
        name: 'CalendarDate',
        parseValue: (val: unknown) => new CalendarDate(val as string),
    },
    {
        name: 'DateTime',
        parseValue: (val: unknown) => new Date(val as string),
    },
];

// The base schema is needed to get the Information about the graphql types returned from your request.
const schema = fs.readFileSync('path/to/your/schema.graphql', 'utf8');
const transformScalars = new TransformCustomScalars(schema, customScalarDefinitions);
const sdk = getSdk(new GraphQLClient('url'), getSdkWrapper(this.transformScalars));
```

You can directly pass your defined GraphQLScalarTypes to the TransformCustomScalars constructor. [graphql-scalars](https://github.com/Urigo/graphql-scalars) has a lot of already pre-defined definitions you can use.

<details>
<summary>Example of a custom definition for the CalendarDate:</summary>

```typescript
import { GraphQLError, GraphQLScalarType, Kind } from 'graphql';
import { CalendarDate } from 'calendar-date';

export const GraphQLCalendarDate: GraphQLScalarType = new GraphQLScalarType({
name: 'CalendarDate',

    description:
    'A field representing a date without time information according to ISO 8601. E.g. "2020-01-01".',
    
    serialize(value: unknown) {
        if (value instanceof CalendarDate) {
            return value.toString();
        }
        if (typeof value === 'string') {
            try {
                const calendarDate = new CalendarDate(value);
                return calendarDate.toString();
            } catch (e) {
                throw new TypeError(
                    `Value of type string does not represent a valid calendar date: ${value}`,
                );
            }
        }
        throw new TypeError(`Value is not an instance of CalendarDate and not a string: ${value}`);
    },
    
    parseValue(value: unknown) {
        if (value instanceof CalendarDate) {
           return value;
        }
        if (typeof value === 'string') {
            try {
                return new CalendarDate(value);
            } catch (e) {
                throw new TypeError(
                    `Value of type string does not represent a valid calendar date: ${value}`,
                );
            }
        }
        throw new TypeError(`Value is not an instance of CalendarDate and not a string: ${value}`);
    },
    
    parseLiteral(ast) {
        if (ast.kind !== Kind.STRING) {
            throw new GraphQLError(`Can only validate strings as CalendarDates but got a: ${ast.kind}`);
        }
        try {
            return new CalendarDate(ast.value);
        } catch (e) {
            throw new TypeError(
                `Value of type string does not represent a valid calendar date: ${ast.kind}`,
            );
        }
    },
});
```
</details>
