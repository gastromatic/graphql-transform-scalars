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

describe('TransformCustomScalars with type conditions', () => {
  const schemaWithAbstractTypes = `
    scalar Cents

    type Author {
      name: String
      born: Cents
    }

    interface Work {
      id: ID!
      title: String
    }

    type Book implements Work {
      id: ID!
      title: String
      published: Cents
      author: Author
    }

    type Blog implements Work {
      id: ID!
      title: String
      publishedDate: Cents
      author: Author
    }

    union Media = Book | Blog

    type Query {
      works: [Work!]!
      media: [Media!]!
    }
  `;

  function createTransformer(operations: string) {
    return new TransformCustomScalars({
      schema: schemaWithAbstractTypes,
      operations,
      transformDefinitions: [{ name: 'Cents', parseValue: (value: unknown) => ({ cents: value }) }],
    });
  }

  test('resolves the same alias to different fields of union members', () => {
    const transformer = createTransformer(`
      query {
        media {
          __typename
          ... on Book {
            date: published
          }
          ... on Blog {
            date: publishedDate
          }
        }
      }
    `);

    const result = transformer.addCustomScalars(
      {
        media: [
          { __typename: 'Book', date: 1 },
          { __typename: 'Blog', date: 2 },
        ],
      },
      'query',
    );

    expect(result).toEqual({
      media: [
        { __typename: 'Book', date: { cents: 1 } },
        { __typename: 'Blog', date: { cents: 2 } },
      ],
    });
  });

  test('resolves the same alias to different fields of interface implementations', () => {
    const transformer = createTransformer(`
      query {
        works {
          __typename
          id
          ... on Book {
            label: title
          }
          ... on Blog {
            label: publishedDate
          }
        }
      }
    `);

    const result = transformer.addCustomScalars(
      {
        works: [
          { __typename: 'Book', id: '1', label: 'title' },
          { __typename: 'Blog', id: '2', label: 3 },
        ],
      },
      'query',
    );

    expect(result).toEqual({
      works: [
        { __typename: 'Book', id: '1', label: 'title' },
        { __typename: 'Blog', id: '2', label: { cents: 3 } },
      ],
    });
  });

  test('resolves the same alias from named fragments on different types', () => {
    const transformer = createTransformer(`
      query {
        media {
          __typename
          ...BookDate
          ...BlogDate
        }
      }

      fragment BookDate on Book {
        date: published
      }

      fragment BlogDate on Blog {
        date: publishedDate
      }
    `);

    const result = transformer.addCustomScalars(
      {
        media: [
          { __typename: 'Book', date: 1 },
          { __typename: 'Blog', date: 2 },
        ],
      },
      'query',
    );

    expect(result).toEqual({
      media: [
        { __typename: 'Book', date: { cents: 1 } },
        { __typename: 'Blog', date: { cents: 2 } },
      ],
    });
  });

  test('applies type conditions of parent objects to nested aliases', () => {
    const transformer = createTransformer(`
      query {
        media {
          __typename
          ... on Book {
            author {
              detail: born
            }
          }
          ... on Blog {
            author {
              detail: name
            }
          }
        }
      }
    `);

    const result = transformer.addCustomScalars(
      {
        media: [
          { __typename: 'Book', author: { detail: 1 } },
          { __typename: 'Blog', author: { detail: 'name' } },
        ],
      },
      'query',
    );

    expect(result).toEqual({
      media: [
        { __typename: 'Book', author: { detail: { cents: 1 } } },
        { __typename: 'Blog', author: { detail: 'name' } },
      ],
    });
  });

  test('matches type conditions on interfaces', () => {
    const transformer = createTransformer(`
      query {
        media {
          __typename
          ... on Work {
            label: title
          }
          ... on Book {
            date: published
          }
        }
      }
    `);

    const result = transformer.addCustomScalars(
      { media: [{ __typename: 'Book', label: 'title', date: 1 }] },
      'query',
    );

    expect(result).toEqual({
      media: [{ __typename: 'Book', label: 'title', date: { cents: 1 } }],
    });
  });
});
