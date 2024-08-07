import { CalendarDate } from 'calendar-date';
import { getSdkWrapper, TransformCustomScalars } from 'graphql-transform-scalars';
import fs from 'fs';
import { getSdk } from './operations.generated';
import { GraphQLClient } from 'graphql-request';

describe('Transform custom scalars according to supplied mappers', () => {
  test('Base query', async () => {
    // Arrange
    const schema = fs.readFileSync('./test/schema.graphql', 'utf8');
    const operations = fs.readFileSync('./test/operations.graphql', 'utf8');
    const transformScalars = new TransformCustomScalars({
      schema,
      transformDefinitions: [
        { name: 'CalendarDate', parseValue: (val: unknown) => new CalendarDate(val as string) },
      ],
      operations,
    });
    const graphqlRequest = new GraphQLClient('');
    graphqlRequest.request = jest.fn().mockResolvedValue({
      authors: [
        {
          id: '1',
          dateOfBirth: '1960-01-01',
          books: [
            {
              id: '1',
              title: 'title 1',
              published: '2022-01-01',
            },
            {
              id: '2',
              title: 'title 2',
              published: '2022-01-05',
            },
          ],
        },
      ],
    });
    const sdk = getSdk(graphqlRequest, getSdkWrapper(transformScalars));

    // Act
    const result = await sdk.GetAuthors();

    // Assert
    const author = result.authors[0];
    expect(author.dateOfBirth.year).toEqual(1960);
    expect(author.dateOfBirth.month).toEqual(1);
    expect(author.dateOfBirth.day).toEqual(1);

    const book1 = author.books[0];
    expect(book1.published.year).toEqual(2022);
    expect(book1.published.month).toEqual(1);
    expect(book1.published.day).toEqual(1);

    const book2 = author.books[1];
    expect(book2.published.year).toEqual(2022);
    expect(book2.published.month).toEqual(1);
    expect(book2.published.day).toEqual(5);
  });

  test('Query of an interface', async () => {
    // Arrange
    const schema = fs.readFileSync('./test/schema.graphql', 'utf8');
    const operations = fs.readFileSync('./test/operations.graphql', 'utf8');
    const transformScalars = new TransformCustomScalars({
      schema,
      transformDefinitions: [
        { name: 'CalendarDate', parseValue: (val: unknown) => new CalendarDate(val as string) },
        { name: 'DateTime', parseValue: (val: unknown) => new Date(val as string) },
      ],
      operations,
    });
    const graphqlRequest = new GraphQLClient('');
    graphqlRequest.request = jest.fn().mockResolvedValue({
      authors: [
        {
          id: '1',
          authorDateOfBirth: '1960-01-01',
          writtenWorks: [
            {
              __typename: 'Book',
              id: '1',
              bookTitle: 'title 1',
              published: '2022-01-01',
            },
            {
              __typename: 'BlogArticle',
              id: '2',
              blogTitle: 'title 2',
              publishedDate: '2021-10-05T14:48:00.000Z',
            },
          ],
        },
      ],
    });
    const sdk = getSdk(graphqlRequest, getSdkWrapper(transformScalars));

    // Act
    const result = await sdk.GetAuthorsWithWrittenWorks();

    // Assert
    const author = result.authors[0];
    expect(author.authorDateOfBirth.year).toEqual(1960);
    expect(author.authorDateOfBirth.month).toEqual(1);
    expect(author.authorDateOfBirth.day).toEqual(1);

    const book = author.writtenWorks[0];
    if (book.__typename !== 'Book') {
      throw new Error('Unexpected type');
    }
    expect(book.published.year).toEqual(2022);
    expect(book.published.year).toEqual(2022);
    expect(book.published.month).toEqual(1);

    const blogArticle = author.writtenWorks[1];
    if (blogArticle.__typename !== 'BlogArticle') {
      throw new Error('Unexpected type');
    }
    expect(blogArticle.publishedDate.getDate()).toEqual(5);
    expect(blogArticle.publishedDate.getFullYear()).toEqual(2021);
  });
});
