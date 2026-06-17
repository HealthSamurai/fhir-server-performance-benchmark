
| Search Parameter Types | Parameters for all resources | Search result parameters |
|---|---|---|
| Number | _id | _sort |
| Date/DateTime | _lastUpdated | _count |
| String | _tag | _include |
| Token | _profile | _revinclude |
| Reference | _security | _summary |
| Composite | _text | _total |
| Quantity | _content | _elements |
| URI | _list | _contained |
| Special | _has | _containedType |
| | _type | |


# Search types

- Fixed `_count=50` for all search 

TODO:  провести анализ всех серч параметров что бы показать общий паттерн (кто/что/когда) и какие в основном присутствуют

## Tested
- [ ] String        (Patient?name=Smith) (just string and complex types (humanname, address) with string component)
- [x] Date          (Patient?birthdate=gt2020-01-01) (period, date, datetime)
- [ ] Reference     (Observation?subject=Patient/123, Observation?subject=Patient/123,Patient/3333 , Encounter?performer=Practitioner/456) (arrays and not arrays)
- [ ] Token         (Patient?identifier=synthetic-benchmark|12345) (arrays and not arrays)
- [ ] Quantity      (Observation?value-quantity=gt5.0|http://unitsofmeasure.org|mg) 
- [ ] Composite     (Observation?component-code-value-concept=12345$gt5.0|http://unitsofmeasure.org|mg) (arrays and not arrays)


### String

Reaaly rare SP and most of resources does'n have string SP or synthetic data

| SP type | ResourceType | Name | Data type | Cardinality |
|---|---|---|---|---|
| string | Patient | name | HumanName | 0..* |
| string | Patient | address | Address | 0..* |
| string | Organization | name | string | 0..1 |


### Date

| SP type | ResourceType | Name | Data type | Cardinality |
|---|---|---|---|---|
| date | Patient | birthdate | date | 0..1 |
| date | Observation | date | datetime | 0..1 |
| date | Encounter | date | Period | 0..1 |


## Skiped
- Number
- URI
- Special


# Combinations

Наверное стоит вывести из статистики

Patient?birthdate=gt2020-01-01&gender=male,female

generate to 2 and 3 parameters combinations from previous step


# Extras

- _sort
- `chaining` (1, 2 hops)
- _has (1, 2 hops)

## Skiped
- _include
- _revinclude

