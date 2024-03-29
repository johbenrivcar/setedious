# setedious

A wrapper for [tedious] that returns named data sets 
from multiple SQL Selects, or SP calls. 
The primary objective of the module is to simplify handling
of returning multiple recordsets from a single SQL call.

Uses [tedious] for the underlying connection to SQL server, and uses the [tedious] execSql() function.

Execution of the SQL is asnychronous. The recordsets returned from a SQL call can be handled either by a callback, or through data set monitors. 

* If using a callback, this is called once only, and all the recordsets returned from the SQL call are handed back in this single call, once all of the SQL execution is complete.

* If using data set monitors, which are keyed on data set name, these are called separately _for each dataset_ whenever that data set is returned _from any subsequent call to execSql(). Once registered, the data set monitor remains active and will be called asynchronously whenever a dataset with a name matching the registered name is returned from an execSql call.

* You can use a mixture of callbacks on specific execSQL calls and data set monitors. During execution of an execSql() call with a callback function, any returned data set with a name matching a data set monitor will be delivered separately to the monitor before being delivered to the callback with all the other data sets.

Errors are also returned as a data set named **errors**, with each row in the set being a single reported error. The sequence of errors is the order in which errors were encountered, not order of severity.
**The SQL code or any stored procedure can add error lines to the errors data set simply by returning one or more data sets with the name "errors".

### Basic features
* Simple submission of SQL statements with a callback:
``` javascript    
        setedious.execSql( sqlStatement, callback );
```
    *The callback receives a single object containing all the recordsets created by the SQL statement, including all recordsets returned by stored procedure calls.*

* Submission of array of SQL statements to be executed in sequence, with a callback:
``` javascript    
    setedious.execSql( [sqlStatement, ..], callback );
```
    *The callback receives a single object containing all the recordsets created by each SQL statement separately. 
    *Each statement in the array is guaranteed to finish before the next one is executed.

* Events to catch recordsets with specific names whenever returned
``` javascript    
        setedious.onDataset( datasetName, callback );
```
    // The callback receives an object containing the a 
    // dataset whenever that named dataset is returned by 
    // any submitted SQL statement.*

___
#### NOTES ON V2 
##### Error handling
    Major changes to error handling mean that the signature for the callback passed to execSql() has changed. Now there is a single return object which includes all the recordsets and all the errors under the key _errors_. So to test for errors in the returned results, check for _recordsets.errors_. More than one error may be returned in _.errors_ from a single call to execSql(). 
___    
## installation
Node.js is a prerequisite of setedious. To install setedious in a project use:

    > npm install setedious

setedious has a dependency on *tedious* which will also be installed if required.

## usage example
```javascript
    // load module and make connection to the database
    const setedious = require( `setedious` );
    setedious.connect( connectOptions );

    // register a handler called whenever "orders" is returned
    setedious.onDataset( "orders", dataSet=>{
        console.log( `dataSet 'orders' has been returned` );
        console.log( dataSet.orders );
    });
```

The above handler will be called whenever any sql statement submitted to setedious returns a dataset named "orders". _Note that all data set names are case-insensitive and are converted to lower case before being returned._

```javascript
    // Define the SQL statement to be run
    let sql = " SELECT 'orders' setName, * FROM ordersTable; "
             + " SELECT 'customers' setName, * FROM customerTable; ";
```

The above SQL statement will return two recordsets, named "orders" and "customers" respectively. _Note empty recordsets are not returned._

```javascript
    // execute the SQL and collect the returned
    // recordsets in a callback.
    setedious.execSQL( sql , ( allrecordsets )=>{
        console.log("All data sets", allrecordsets );
        if(allrecordsets.errors) console.log("Errors", allrecordsets.errors );
    });
```
    
The above js statement will execute the SQL, and return the recordsets back to the callback. _By convention_ if an error has occurred in execution of the SQL, then a dataset "errors" is included in the returned recordsets.

* Note that there may be both an _errors_ data set and also other recordsets returned as a result of a single call.
* Note that SQL errors such as invalid syntax will be returned in the _errors_ dataset, **not** by a thrown error.
* Note that multiple errors may be returned as the result of a single call, in which case the _errors_ data set will contain multiple rows.

### setName column in SQL statements
To correctly allocate returned data rows to a named dataSet, the first column of all records in a result set must be named **setName** and be set to the string name of the dataset:

*Example*

    SELECT "persons" setName, * FROM T_PERSONS;

**NOTES**
 * If there is no setName column, then the set name defaults to **dataset**. 

* The value of the column _setName_ is regarded as case-insensitive and all set names will be converted to lower-case strings in the results. Therefore, rows returned with _setName_ differing only by capitalisation will be returned in the _same_ dataset, whose set name will be lower-case letters only.

* If multiple SQL statements in a single request return rows with the **same** *setName* then all the rows returned from those SQL statements are concatenated in a single dataset. For example, the SQL below will return a single dataset named **PLANES** containing all records from both tables, monoplanes first then biplanes:

        let sql = " SELECT 'PLANES' setName, * FROM t_MonoPLANES ORDER BY name; SELECT 'PLANES' setName, * FROM t_BiPLANES ORDER BY name;"

* If different rows returned from a single SQL statement have a different *setName*, then the rows will be separated into multiple recordsets with different names. This means you can allocate the value of the *setName* as part of a single SQL statement to separate the returned data into different recordsets. For example, this SQL will return two recordsets, one ADULTS and one named KIDS:

        let sql = " SELECT CASE WHEN age>=18 THEN 'ADULTS' ELSE 'KIDS' END setName, * FROM tAllPeople; "

* The *setName* column is removed from all rows in the dataset before it is returned to the callback function.

* Any field in the database that has a name ending with the string *_json* is parsed to an object using *JSON.parse()* before being returned in the dataset, and the *_json* suffix is removed from the column name. The original JSON text is also included.

### connection options
options supplied to the *connect()* function must be an object with this structure:

    {
        connectionPoolLimit: 10
        , includeMetadata: false 
        , tedious: {
            server: "SERVER_NAME_OR_IP"
            , authentication: {
                type: "default"
                , options: { 
                    userName: "userName"
                    , password: "password"
                }
            }
            , options: {
                database: "defaultDatabaseName"
                , "trustServerCertificate": true
            }
        }
    }

The meanings of the connection options are:
* connectionPoolLimit
    * *Default: 10*. The maximum allowed number of simultaneous connections to the database held in the connection pool. While the number of connections is below the limit, **setedious** automatically opens additional connections to the database if *execSql()* is called when all the existing connections are already busy with earlier requests. Without a limit this could mean that more connections are opened than is desirable, for example if occasional bursts of calls are made in quick succession. However if the limit is set too low to handle the general volume of requests for the application, this may result in a large queue of SQL requests buiding up - see *Request queueing* below.
* includeMetadata
    * *Default: false*. If set to **true**, then per-field *type metadata* is included in the returned dataset as separate fields in each dataset row. Each metadata field is named with the suffix *_type* after the field name to which it relates. 
* tedious
    * This section contains the options passed to **tedious** to establish a database connection - see **tedious** documentation for details. 
        * **NOTE:** These **tedious** options are not available:
            * *rowCollectionOnDone* 
            * *useColumnNames* - column names are always used as keys in the rows of the returned dataSet
            * *rowCollectionOnRequestCompletion* 
## Request queueing
**setedious** maintains a pool of connections to the database which are used to dispatch *execSql()* in order of arrival. If a call is made to *execSql* when there are no free connections available, because earlier calls have used them up and the results have not yet been returned, then **setedious** initiates opening a new connection, which is added to the pool.

* While a new pool connection is pending, no further new connection requests are made. Any further calls to *execSql* are queued.

* Any connections on which errors are thrown by **tedious** are closed, so will not be re-used. 

* As soon as either a) one of the previously-occupied connections is freed or b) a new connection request is fulfilled, then the longest-waiting *execSql()* request is dispatched from the queue. If there are still queued requests and no pending new connection requests, another new connection is opened.

* If the connection limit has been reached (options.connectionPoolLimit) than no further new connections to the database will be requested, and queued requests must wait for the existing connections to be freed up.

## Error handling
Errors are reported from the SQL by the explicit creation of an **errors** dataset, which is then delivered to handlers that have been registered by either `setedious.on( "errors", eventMonitor )`, or `setedious.on("error", eventMonitor)` or `setedious.onError( eventMonitor )`.

If an **errors** record set is returned as from any SQL request with a callback, it is returned to the callback function as one of the recordsets along with any others that were returned.

Recordsets with the name **error** or **errors** can be returned from stored procedures along with any other record sets.
