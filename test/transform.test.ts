import { getSdkWrapper, TransformCustomScalars } from 'graphql-transform-scalars';

const schema = `
  scalar Cents

  type Item {
    id: ID!
    price: Cents
    prices: [Cents!]!
  }

  type Other {
    id: ID!
    label: String
  }

  type Query {
    item: Item
    other: Other
  }

  type Mutation {
    updateItem: Item
  }
`;

function createTransformer(operations: string) {
  return new TransformCustomScalars({
    schema,
    operations,
    transformDefinitions: [{ name: 'Cents', parseValue: (value: unknown) => ({ cents: value }) }],
  });
}

describe('TransformCustomScalars', () => {
  test('transforms falsy custom scalar values', () => {
    const transformer = createTransformer('query { item { id price prices } }');

    const result = transformer.addCustomScalars(
      { item: { id: '1', price: 0, prices: [0, 5] } },
      'query',
    );

    expect(result).toEqual({
      item: { id: '1', price: { cents: 0 }, prices: [{ cents: 0 }, { cents: 5 }] },
    });
  });

  test('keeps null values', () => {
    const transformer = createTransformer('query { item { id price } }');

    const result = transformer.addCustomScalars({ item: { id: '1', price: null } }, 'query');

    expect(result).toEqual({ item: { id: '1', price: null } });
  });

  test('resolves aliased query fields', () => {
    const transformer = createTransformer('query { myItem: item { id cost: price } }');

    const result = transformer.addCustomScalars({ myItem: { id: '1', cost: 5 } }, 'query');

    expect(result).toEqual({ myItem: { id: '1', cost: { cents: 5 } } });
  });

  test('resolves aliased mutation fields', () => {
    const transformer = createTransformer('mutation { updated: updateItem { id price } }');

    const result = transformer.addCustomScalars({ updated: { id: '1', price: 5 } }, 'mutation');

    expect(result).toEqual({ updated: { id: '1', price: { cents: 5 } } });
  });

  test('resolves aliases from fragments spread before their definition', () => {
    const transformer = createTransformer(`
      query {
        item {
          ...ItemA
        }
      }

      fragment ItemA on Item {
        ...ItemB
      }

      fragment ItemB on Item {
        cost: price
      }
    `);

    const result = transformer.addCustomScalars({ item: { cost: 5 } }, 'query');

    expect(result).toEqual({ item: { cost: { cents: 5 } } });
  });

  test('resolves aliases from fragments spread on the root type', () => {
    const transformer = createTransformer(`
      query {
        ...Root
      }

      fragment Root on Query {
        myItem: item {
          cost: price
        }
      }
    `);

    const result = transformer.addCustomScalars({ myItem: { cost: 5 } }, 'query');

    expect(result).toEqual({ myItem: { cost: { cents: 5 } } });
  });

  describe('with aliases of the same response key in several operations', () => {
    const operations = `
      mutation UpdateItem {
        item: updateItem {
          id
          price
        }
      }

      query GetOther {
        item: other {
          id
          label
        }
      }

      query GetItem {
        item {
          id
          price
        }
      }
    `;

    test('resolves aliases of the named operation only', () => {
      const transformer = createTransformer(operations);

      expect(
        transformer.addCustomScalars({ item: { id: '1', price: 5 } }, 'query', 'GetItem'),
      ).toEqual({ item: { id: '1', price: { cents: 5 } } });
      expect(
        transformer.addCustomScalars({ item: { id: '1', label: 'a' } }, 'query', 'GetOther'),
      ).toEqual({ item: { id: '1', label: 'a' } });
      expect(
        transformer.addCustomScalars({ item: { id: '1', price: 5 } }, 'mutation', 'UpdateItem'),
      ).toEqual({ item: { id: '1', price: { cents: 5 } } });
    });

    test('keeps root fields of the schema without an operation name', () => {
      const transformer = createTransformer(operations);

      const result = transformer.addCustomScalars({ item: { id: '1', price: 5 } }, 'query');

      expect(result).toEqual({ item: { id: '1', price: { cents: 5 } } });
    });

    test('passes the operation name from the sdk wrapper', async () => {
      const sdkWrapper = getSdkWrapper(createTransformer(operations));

      const result = await sdkWrapper(
        async () => ({ item: { id: '1', price: 5 } }),
        'GetItem',
        'query',
      );

      expect(result).toEqual({ item: { id: '1', price: { cents: 5 } } });
    });
  });
});
