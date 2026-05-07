export default
{
  "string": {
    "Patient": {
      "name": {
        "modifiers": ["", ":contains"],
        "values": [
          "NON-EXISTS",
          "Emilia", "Carolynn", "Stefan", "Linh", "Harold",
          "Pilar", "Ron", "Garfield", "Margaretta", "Giovanna",
          "Dione", "Arron", "Lanny", "Harvey", "Beatriz",
          "Donovan", "Reyes", "Santiago", "Kyong", "Curtis"
        ]
      },
      "address": {
        "modifiers": ["", ":contains"],
        "values": [
          "NON-EXISTS",
          "Raynham", "Springfield", "Lowell", "Southwick", "Mashpee",
          "Holbrook", "Falmouth", "Revere", "Sturbridge", "Blackstone",
          "Westport", "Walpole", "Northampton", "Fall River", "Waltham",
          "Acushnet Center", "Newton", "Winchester", "Maynard"
        ]
      }
    },
    "Organization": {
      "name": {
        "modifiers": ["", ":contains"],
        "values": [
          "NON-EXISTS",
          "ORLEANS MEDICAL CENTER, P.C.",
          "ENCOMPASS HEALTH BRAINTREE HOSPITAL OF BRAINTREE",
          "STEWARD HOLY FAMILY HOSPITAL INC",
          "THE NORTHEAST HEALTH GROUP, INC",
          "PLYMOUTH BAY INTERNAL MEDICINE",
          "ART OF CARE INC",
          "T MASSACHUSETTS, LLC",
          "RIVERBEND OF SOUTH NATICK",
          "NEW ENGLAND PROFESSIONAL HOME HEALTH CARE LLC",
          "HDH CORPORATION",
          "ELARA CARING",
          "OVERLOOK MASONIC HEALTH CENTER",
          "ENCOMPASS HEALTH REHAB HOSPITAL OF WESTERN MASS",
          "PLYMOUTH CARVER PRIMARY CARE, P.C.",
          "BOSTON HEALTH CARE FOR THE HOMELESS PROGRAM INC",
          "TUFTS MEDICAL CENTER",
          "GREATER LOWELL FAMILY PRACTICE PC",
          "NORTH READING INTERNAL MEDICINE PC"
        ]
      }
    }
  },

  "date": {
    "Patient": {
      "birthdate": {
        "prefixes": ["", "eq", "lt", "gt", "ge", "le", "sa", "eb"],
        "values": [
          "2070-01-01", 
          "1991-05-12", "2003-09-14", "1916-12-23", "1964-04-23", "1913-12-30",
          "1978-05-25", "2011-01-12", "1932-09-05", "2007-09-10", "1968-12-27",
          "2004-07-19", "2018-01-08", "2022-05-05", "2000-01-18", "2013-10-07",
          "1980-06-12", "2019-10-23", "1954-03-21", "1961-09-27", "1942-07-18",
        ]
      }
    },
    "Observation": {
      "date": {
        "prefixes": ["", "eq", "lt", "gt", "ge", "le", "sa", "eb"],
        "values": [
          "2070-01-01T00:00:00", 
          "2017-01-29T05:36:48", "2024-05-30T06:16:35", "2016-08-21T14:53:50", "2021-01-26T16:56:53", "2022-07-28T10:41:20",
          "2021-07-29T06:16:35", "2017-10-30T18:53:59", "2015-09-05T00:05:56", "2017-07-09T06:36:13", "2014-12-07T14:53:50",
          "2015-04-23T06:57:55", "2023-07-06T04:32:31", "2016-09-18T14:53:50", "2021-12-30T18:23:17", "2019-03-17T05:36:48",
          "2015-09-23T09:33:23", "2018-06-02T19:17:08", "2023-09-11T03:55:48", "2024-06-07T02:18:51", "2018-04-12T07:33:57"
        ]
      }
    },
    "Encounter": {
      "date": {
        "prefixes": ["", "eq", "lt", "gt", "ge", "le", "sa", "eb"],
        "values": [
          "2070-01-01", 
          "1988-11-29", "2017-12-16", "2019-08-14", "1999-06-26", "1962-05-07",
          "1986-09-06", "2015-07-09", "2015-09-05", "2016-12-29", "1958-08-07",
          "1990-10-02", "2017-11-28", "2024-01-22", "2019-01-05", "2019-08-04",
          "1998-12-05", "1990-07-20", "2021-02-16", "2022-06-24", "2017-02-22"
        ]
      }
    }
  },


  "token": {
    "Observation": {
      "category": {
        "values": [
          "missing-data|for-null-searches",
          "laboratory",
          "http://terminology.hl7.org/CodeSystem/observation-category|laboratory"
        ]
      }
    }
  }
}
