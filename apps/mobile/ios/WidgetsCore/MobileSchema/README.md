# Swift Mobile GraphQL Schema

This Framework contains autogenerated code that is generated from running Apollo iOS graphQL codegen.

## To generate/update graphQL queries and Schemas

`yarn mobile graphql:generate:swift`

## To change paths to the Schema and Queries

edit `"operationSearchPaths"` and `"schemaSearchPaths"` in `apps/mobile/ios/apollo-codegen-config.json`

## Adding New Generated Files

Files must be manually added to the Xcode Project to be used. As the schema is modified, new files may be introduced that should be added. To add new files, right-click the `WidgetsCore` folder in XCode, and select `add files to "Uniswap"...`. Then select the fragments, operations, and schema folder and keep create groups checked. Then click add.