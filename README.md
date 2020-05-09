# setedious
A wrapper for [tedious] that returns named data sets from multiple SQL Selects, or SP calls

Basic features
* Simple submission of SQL statements with a callback:
    setedious.execSql( sqlStatement, callback );
    
    **The callback receives an object containing named datasets created by the SQL statement**
* Events to handle datasets with specific names whenever returned
    setedious.onDataset( datasetName, callback );
    
    **The callback receives an object containing the named dataset whenever that dataset is returned by any submitted SQL statement**
    

## usage


    
