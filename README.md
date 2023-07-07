# graphql-transform-scalars

Automatically transform custom graphql scalars to your desired type.

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

const schema = fs.readFileSync('path/to/your/schema.graphql', 'utf8');
const transformScalars = new TransformCustomScalars(schema, {
    // Custom transformers
    DateTime: (val: string) => new Date(val),
    CalendarDate: (val: string) => new CalendarDate(val),
});
const sdk = getSdk(new GraphQLClient('url'), getSdkWrapper(this.transformScalars));
```